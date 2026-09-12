import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { ICON_SVG_MAX_LENGTH, sanitizeIconSvg } from "@/lib/svg-icon";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const maxDuration = 60;

/** 20 solicitudes por tienda cada 10 minutos: la generación es opcional y de nivel gratuito. */
const ICON_SUGGESTIONS_LIMIT = 20;
const ICON_SUGGESTIONS_WINDOW_SECONDS = 10 * 60;
const ICON_SUGGESTIONS_MAX_PROPOSALS = 3;

const requestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(3, "Describe el icono con al menos 3 caracteres")
    .max(120, "Describe el icono en máximo 120 caracteres"),
  seed: z.number().int().min(0).max(1_000_000).optional(),
});

const outputSchema = z.object({
  proposals: z
    .array(
      z.object({
        description: z.string().max(120),
        svg: z.string().max(ICON_SVG_MAX_LENGTH),
      }),
    )
    .min(1)
    .max(ICON_SUGGESTIONS_MAX_PROPOSALS),
});

function getIconSuggestionsRateLimitKey(storeId: string, now = new Date()) {
  const window = Math.floor(now.getTime() / 1000 / ICON_SUGGESTIONS_WINDOW_SECONDS);
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
    seed !== undefined ? `Variation seed: ${seed}. Propose alternatives you have not proposed before.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getModelError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/quota|resource_exhausted|rate limit|\b429\b/i.test(message)) {
    return new AppError("Se alcanzó el límite gratuito de generación de iconos. Intenta más tarde.", 429);
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
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    if (!env.GEMINI_API_KEY) {
      throw new AppError("La generación de iconos con IA no está configurada. Agrega GEMINI_API_KEY en el panel.", 503);
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Describe el icono");
    }
    const { prompt, seed } = parsed.data;

    await reserveRequest(Redis.fromEnv(), params.storeId);

    const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
    let output: z.infer<typeof outputSchema> | undefined;
    try {
      const result = await generateText({
        model: google("gemini-3.5-flash-lite"),
        output: Output.object({ schema: outputSchema }),
        prompt: buildIconSuggestionsPrompt(prompt, seed),
      });
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
      throw new AppError("La IA no devolvió un icono utilizable. Describe el objeto con otras palabras.", 422);
    }

    return NextResponse.json({ proposals }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "TYPE_ICON_SUGGESTIONS_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
