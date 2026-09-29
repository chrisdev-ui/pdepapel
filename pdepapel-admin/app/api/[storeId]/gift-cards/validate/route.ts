import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import { parseGiftCardCode } from "@/lib/gift-card-codes";
import { findGiftCardByCode, isGiftCardUsable } from "@/lib/gift-cards";
import prismadb from "@/lib/prismadb";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * Validación pública de un código en el checkout. Devuelve solo lo que la
 * clienta necesita ver: saldo y terminación. Con límite por IP y por código
 * para que nadie adivine códigos a fuerza de intentos (lib/rate-limit.ts).
 */
export const VALIDATE_RATE_LIMIT_PER_IP = 20;
export const VALIDATE_RATE_LIMIT_PER_CODE = 10;
export const VALIDATE_RATE_WINDOW_SECONDS = 600;

const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const headers = getCorsHeaders(req);
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const perIp = await consumeRateLimit({
      key: `gift-card-validate:${params.storeId}:${getClientKey(req)}`,
      limit: VALIDATE_RATE_LIMIT_PER_IP,
      windowSeconds: VALIDATE_RATE_WINDOW_SECONDS,
    });
    if (!perIp.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo." },
        { status: 429, headers: { ...headers, "Retry-After": String(perIp.retryAfterSeconds) } },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = parseGiftCardCode(body?.code);
    if (!parsed) {
      throw ErrorFactory.InvalidRequest("Ese código no tiene la forma de una tarjeta de regalo (PDP-XXXX-XXXX-XXXX)");
    }

    const perCode = await consumeRateLimit({
      key: `gift-card-validate-code:${params.storeId}:${parsed.hash.slice(0, 16)}`,
      limit: VALIDATE_RATE_LIMIT_PER_CODE,
      windowSeconds: VALIDATE_RATE_WINDOW_SECONDS,
    });
    if (!perCode.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos con ese código. Espera unos minutos." },
        { status: 429, headers: { ...headers, "Retry-After": String(perCode.retryAfterSeconds) } },
      );
    }

    const card = await findGiftCardByCode(prismadb, params.storeId, body?.code);
    if (!card) throw ErrorFactory.NotFound("No encontramos una tarjeta con ese código");
    if (card.status !== "ACTIVE") throw ErrorFactory.Conflict("Esa tarjeta de regalo fue anulada");
    if (card.expiresAt && card.expiresAt.getTime() < Date.now()) {
      throw ErrorFactory.Conflict("Esa tarjeta de regalo ya venció");
    }
    if (!isGiftCardUsable(card)) throw ErrorFactory.Conflict("Esa tarjeta de regalo ya no tiene saldo");

    return NextResponse.json(
      { balance: card.balance, last4: card.codeLast4, expiresAt: card.expiresAt },
      { headers },
    );
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_VALIDATE", { headers, expectedStatusCodes: [404, 409] });
  }
}
