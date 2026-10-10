import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logModelUsage } from "@/lib/ai-usage";
import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { sanitizeIconSvg } from "@/lib/svg-icon";
import {
  ICON_SUGGESTIONS_MAX_PROPOSALS,
  iconSuggestionsOutputSchema,
} from "@/lib/type-icon-suggestions";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { createAiProviders } from "@/lib/ai-model-providers";
import { AiBusyError, runStructured } from "@/lib/ai-provider";

export const maxDuration = 60;

/** 20 solicitudes por tienda cada 10 minutos: la generación es opcional y de nivel gratuito. */
const ICON_SUGGESTIONS_LIMIT = 20;
const ICON_SUGGESTIONS_WINDOW_SECONDS = 10 * 60;
/** Dos intentos (principal y respaldo) caben en los 60 s de la función. */
const ICON_SUGGESTIONS_TIMEOUT_MS = 25_000;

const requestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(3, "Describe el icono con al menos 3 caracteres")
    .max(120, "Describe el icono en máximo 120 caracteres"),
  seed: z.number().int().min(0).max(1_000_000).optional(),
});

function getIconSuggestionsRateLimitKey(storeId: string, now = new Date()) {
  const window = Math.floor(
    now.getTime() / 1000 / ICON_SUGGESTIONS_WINDOW_SECONDS,
  );
  return `store:${storeId}:type-icon-suggestions:${window}`;
}

function buildIconSuggestionsPrompt(description: string, seed?: number) {
  return [
    "You design icons for the Lucide icon set (https://lucide.dev).",
    `Create ${ICON_SUGGESTIONS_MAX_PROPOSALS} distinct icon proposals for this concept, described in Spanish: "${description}".`,
    "Rules for every icon:",
    "- 24x24 grid, 2px stroke, round line caps and joins, no fill, a single color (currentColor).",
    "- Keep at least 1px of padding from the edges and avoid tiny details that vanish at 16px.",
    "- Use only these elements: path, circle, line, rect, polyline, polygon, ellipse.",
    "- Use only geometric attributes (d, cx, cy, r, rx, ry, x, y, x1, y1, x2, y2, width, height, points). No fill, stroke, style, class, id, transform, text, gradients, images, scripts or links.",
    "- Return in `svg` ONLY the inner elements, without the <svg> wrapper, in a single line.",
    "- Keep each proposal under 1500 characters and use at most 12 elements.",
    "Make the proposals visibly different from each other (composition, viewpoint or detail).",
    seed !== undefined
      ? `Variation seed: ${seed}. Propose alternatives you have not proposed before.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getModelError(error: unknown) {
  if (error instanceof AiBusyError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/quota|resource_exhausted|rate limit|\b429\b/i.test(message)) {
    return new AppError(
      "Se alcanzó el límite gratuito de generación de iconos. Intenta más tarde.",
      429,
    );
  }
  return error;
}

async function reserveRequest(redis: Redis, storeId: string) {
  const key = getIconSuggestionsRateLimitKey(storeId);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ICON_SUGGESTIONS_WINDOW_SECONDS * 2);
  if (count > ICON_SUGGESTIONS_LIMIT) {
    throw new AppError(
      `Ya se generaron ${ICON_SUGGESTIONS_LIMIT} iconos en los últimos 10 minutos. Espera un momento antes de pedir otro.`,
      429,
    );
  }
}

/**
 * Propuestas de icono propio para una categoría, en el estilo de Lucide.
 * Devuelve hasta tres iconos ya saneados (solo trazos); la persona los revisa
 * en el formulario y nada se guarda desde aquí.
 */
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
        "La generación de iconos con IA no está configurada. Avísale a quien administra el sistema: falta la clave de IA en Vercel.",
        503,
      );
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw ErrorFactory.InvalidRequest(
        parsed.error.issues[0]?.message ?? "Describe el icono",
      );
    }
    const { prompt, seed } = parsed.data;

    const redis = Redis.fromEnv();
    await reserveRequest(redis, params.storeId);

    let output: z.infer<typeof iconSuggestionsOutputSchema> | undefined;
    try {
      const result = await runStructured({
        feature: "types.icon-suggestions",
        schema: iconSuggestionsOutputSchema,
        primary: providers.primary,
        fallback: providers.fallback,
        store: redis,
        timeoutMs: ICON_SUGGESTIONS_TIMEOUT_MS,
        prompt: buildIconSuggestionsPrompt(prompt, seed),
      });
      logModelUsage("types.icon-suggestions", result.usage);
      output = result.output;
    } catch (error) {
      throw getModelError(error);
    }

    const proposals = Array.from(
      new Set(
        (output?.proposals ?? [])
          .map((proposal) => sanitizeIconSvg(proposal.svg))
          .filter((svg): svg is string => Boolean(svg)),
      ),
    ).slice(0, ICON_SUGGESTIONS_MAX_PROPOSALS);

    if (proposals.length === 0) {
      throw new AppError(
        "La IA no devolvió un icono utilizable. Describe el objeto con otras palabras.",
        422,
      );
    }

    return NextResponse.json(
      { proposals },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "TYPE_ICON_SUGGESTIONS_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
