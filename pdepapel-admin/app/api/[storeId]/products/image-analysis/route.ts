import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { auth } from "@clerk/nextjs";
import { Redis } from "@upstash/redis";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";

import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import {
  buildProductImageAnalysisPrompt,
  getProductImageAnalysisRateLimitKey,
  isSupportedProductImageUrl,
  PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT,
  productImageAnalysisOutputSchema,
  productImageAnalysisRequestSchema,
  sanitizeProductImageAnalysis,
} from "@/lib/product-image-analysis";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

const RATE_LIMIT_EXPIRY_SECONDS = 60 * 60 * 48;
const MAX_TAXONOMY_OPTIONS = 100;

function getModelError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/quota|resource_exhausted|rate limit|\b429\b/i.test(message)) {
    return new AppError(
      "Se alcanzó el límite gratuito de análisis de imágenes. Intenta nuevamente más tarde.",
      429,
    );
  }

  return error;
}

async function reserveDailyAnalysis(storeId: string) {
  const redis = Redis.fromEnv();
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

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    if (!env.GEMINI_API_KEY) {
      throw new AppError(
        "El análisis visual aún no está configurado. Agrega GEMINI_API_KEY en la administración antes de usarlo.",
        503,
      );
    }

    const payload = productImageAnalysisRequestSchema.parse(await req.json());
    if (!payload.imageUrls.every(isSupportedProductImageUrl)) {
      throw ErrorFactory.InvalidRequest(
        "Solo se pueden analizar imágenes seguras cargadas en el catálogo.",
      );
    }

    const [colors, designs] = await Promise.all([
      prismadb.color.findMany({
        where: { storeId: params.storeId },
        orderBy: { name: "asc" },
        take: MAX_TAXONOMY_OPTIONS,
        select: { id: true, name: true, value: true },
      }),
      prismadb.design.findMany({
        where: { storeId: params.storeId },
        orderBy: { name: "asc" },
        take: MAX_TAXONOMY_OPTIONS,
        select: { id: true, name: true },
      }),
    ]);

    const remainingAnalysesToday = await reserveDailyAnalysis(params.storeId);
    const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
    const result = await generateText({
      model: google("gemini-3.5-flash-lite"),
      output: Output.object({ schema: productImageAnalysisOutputSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildProductImageAnalysisPrompt({
                categoryName: payload.categoryName,
                colors: colors.map((color) => color.name),
                designs: designs.map((design) => design.name),
              }),
            },
            ...payload.imageUrls.map((url) => ({
              type: "file" as const,
              mediaType: "image",
              data: url,
            })),
          ],
        },
      ],
    });

    if (!result.output) {
      throw new AppError(
        "No fue posible crear una propuesta a partir de estas fotos. Intenta con una imagen más clara.",
        422,
      );
    }

    return NextResponse.json({
      analysis: sanitizeProductImageAnalysis(result.output, {
        colors,
        designs,
      }),
      remainingAnalysesToday,
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
