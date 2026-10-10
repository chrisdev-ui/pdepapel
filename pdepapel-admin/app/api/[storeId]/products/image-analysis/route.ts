import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAiProviders } from "@/lib/ai-model-providers";
import {
  AI_BUSY_MINUTE_MESSAGE,
  AiBusyError,
  createAiRouter,
} from "@/lib/ai-provider";
import { logModelUsage } from "@/lib/ai-usage";
import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import {
  getProductImageAnalysisCacheKey,
  getProductImageAnalysisRateLimitKey,
  isSupportedProductImageUrl,
  PRODUCT_IMAGE_ANALYSIS_CACHE_TTL_SECONDS,
  PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT,
  productImageAnalysisOutputSchema,
  productImageAnalysisRequestSchema,
  sanitizeProductImageAnalysis,
} from "@/lib/product-image-analysis";
import {
  analyzeProductImages,
  fetchAnalysisImage,
  isModelQuotaError,
  PIPELINE_BUDGET_MS,
  remapAnalysisPhotos,
} from "@/lib/product-image-analysis-pipeline";
import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

export const maxDuration = 60;

const RATE_LIMIT_EXPIRY_SECONDS = 60 * 60 * 48;

const cachedRunSchema = z.object({
  output: productImageAnalysisOutputSchema,
  photosRead: z.array(z.number().int().min(0)),
  skipped: z.array(
    z.object({ photo: z.number().int().min(0), reason: z.string() }),
  ),
  analyzedWith: z.array(z.enum(["gemini", "openai"])).optional(),
});

function getModelError(error: unknown) {
  if (error instanceof AiBusyError) return error;
  if (isModelQuotaError(error)) return new AiBusyError(AI_BUSY_MINUTE_MESSAGE);
  return error;
}

async function reserveDailyAnalysis(redis: Redis, storeId: string) {
  const key = getProductImageAnalysisRateLimitKey(storeId);
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_EXPIRY_SECONDS);
  }

  if (count > PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT) {
    throw new AppError(
      `Ya usaste los ${PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT} análisis visuales disponibles hoy. Intenta de nuevo mañana.`,
      429,
    );
  }

  return PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT - count;
}

async function getRemainingDailyAnalyses(redis: Redis, storeId: string) {
  const count = await redis.get<number>(
    getProductImageAnalysisRateLimitKey(storeId),
  );

  return Math.max(
    0,
    PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT -
      (typeof count === "number" ? count : 0),
  );
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const providers = createAiProviders({
      openai: env.OPENAI_API_KEY,
      gemini: env.GEMINI_API_KEY,
    });
    if (!providers.primary) {
      throw new AppError(
        "El análisis visual no está configurado. Avísale a quien administra el sistema: falta la clave de IA en Vercel.",
        503,
      );
    }

    const payload = productImageAnalysisRequestSchema.parse(await req.json());
    if (!payload.imageUrls.every(isSupportedProductImageUrl)) {
      throw ErrorFactory.InvalidRequest(
        "Solo se pueden analizar imágenes seguras cargadas en el catálogo.",
      );
    }

    const [categories, sizes, colors, designs] = await Promise.all([
      prismadb.category.findMany({
        where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          type: { select: { name: true } },
        },
      }),
      prismadb.size.findMany({
        where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
        orderBy: { name: "asc" },
        select: { id: true, name: true, value: true },
      }),
      prismadb.color.findMany({
        where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
        orderBy: { name: "asc" },
        select: { id: true, name: true, value: true },
      }),
      prismadb.design.findMany({
        where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    const brokenImages = await prismadb.image.findMany({
      where: {
        url: { in: payload.imageUrls },
        brokenAt: { not: null },
        OR: [
          { product: { storeId: params.storeId } },
          { productGroup: { storeId: params.storeId } },
        ],
      },
      select: { url: true },
    });
    const brokenUrls = new Set(brokenImages.map((image) => image.url));
    const usableIndexes = payload.imageUrls.flatMap((url, index) =>
      brokenUrls.has(url) ? [] : [index],
    );
    const brokenSkips = payload.imageUrls.flatMap((url, photo) =>
      brokenUrls.has(url) ? [{ photo, reason: "Imagen rota" }] : [],
    );
    if (usableIndexes.length === 0) {
      throw new AppError(
        "Todas las fotos están marcadas como rotas. Vuelve a subirlas para poder analizarlas.",
        422,
      );
    }
    const usableUrls = usableIndexes.map((index) => payload.imageUrls[index]);
    const taxonomy = {
      categories,
      sizes,
      colors,
      designs,
      photoCount: payload.imageUrls.length,
    };
    const respond = (
      run: z.infer<typeof cachedRunSchema>,
      extra: {
        remainingAnalysesToday: number;
        reusedAnalysis: boolean;
        message: string;
      },
    ) => {
      const remapped = remapAnalysisPhotos(run, usableIndexes);
      return NextResponse.json({
        analysis: sanitizeProductImageAnalysis(remapped.output, {
          ...taxonomy,
          current: {
            name: payload.currentName,
            categoryName: payload.categoryName,
          },
        }),
        analyzedWith: run.analyzedWith ?? ["gemini"],
        photoCount: payload.imageUrls.length,
        photosRead: remapped.photosRead,
        skipped: [...brokenSkips, ...remapped.skipped].sort(
          (a, b) => a.photo - b.photo,
        ),
        ...extra,
      });
    };

    const redis = Redis.fromEnv();
    const cacheKey = getProductImageAnalysisCacheKey(params.storeId, {
      imageUrls: usableUrls,
      categoryName: payload.categoryName,
      currentName: payload.currentName,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        typeName: category.type.name,
      })),
      sizes,
      colors,
      designs,
    });
    const cachedRun = cachedRunSchema.safeParse(await redis.get(cacheKey));

    if (cachedRun.success) {
      return respond(cachedRun.data, {
        remainingAnalysesToday: await getRemainingDailyAnalyses(
          redis,
          params.storeId,
        ),
        reusedAnalysis: true,
        message:
          "Se reutilizó una propuesta para estas mismas fotos. No consumió otro análisis visual.",
      });
    }

    const remainingAnalysesToday = await reserveDailyAnalysis(
      redis,
      params.storeId,
    );
    const router = createAiRouter({
      primary: providers.primary,
      fallback: providers.fallback,
      feature: "products.image-analysis",
      store: redis,
      deadline: Date.now() + PIPELINE_BUDGET_MS,
    });
    // Si el modelo falla, el análisis reservado se devuelve: la cuota diaria
    // es de análisis hechos, no de intentos.
    let run;
    try {
      run = await analyzeProductImages({
        imageUrls: usableUrls,
        categoryName: payload.categoryName,
        currentName: payload.currentName,
        lists: {
          categories: categories.map(
            (category) => `${category.name} (${category.type.name})`,
          ),
          sizes: sizes.map((size) => size.name),
          colors: colors.map((color) => color.name),
          designs: designs.map((design) => design.name),
        },
        generate: router.generate,
        fetchImage: fetchAnalysisImage,
      });
    } catch (modelError) {
      try {
        await redis.decr(getProductImageAnalysisRateLimitKey(params.storeId));
      } catch (refundError) {
        console.error("[PRODUCT_IMAGE_ANALYSIS_REFUND]", refundError);
      }
      throw getModelError(modelError);
    }
    logModelUsage("products.image-analysis", run.usage);

    const { usage: _usage, timings, ...rest } = run;
    const cachedValue = { ...rest, analyzedWith: router.providersUsed() };
    console.info("[PRODUCT_IMAGE_ANALYSIS_TIMINGS]", timings);
    try {
      await redis.set(cacheKey, cachedValue, {
        ex: PRODUCT_IMAGE_ANALYSIS_CACHE_TTL_SECONDS,
      });
    } catch (cacheError) {
      console.error(
        "[PRODUCT_IMAGE_ANALYSIS_CACHE_SET] Could not cache visual analysis",
        cacheError,
      );
    }

    return respond(cachedValue, {
      remainingAnalysesToday,
      reusedAnalysis: false,
      message:
        "Propuesta creada. Revisa y confirma los campos antes de guardar el producto.",
    });
  } catch (error) {
    return handleErrorResponse(
      getModelError(error),
      "PRODUCT_IMAGE_ANALYSIS_POST",
    );
  }
}
