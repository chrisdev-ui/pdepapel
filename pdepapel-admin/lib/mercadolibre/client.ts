import { MarketplaceConnectionStatus } from "@prisma/client";

import { AppError } from "@/lib/api-errors";

import { getMercadoLibreConfig } from "./config";
import { decryptMercadoLibreToken, encryptMercadoLibreToken } from "./crypto";
import { refreshMercadoLibreAccessToken } from "./oauth";
import prismadb from "@/lib/prismadb";

const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000;
const API_BASE_URL = "https://api.mercadolibre.com";

/**
 * Fallo de Mercado Libre convertido en error de la API del panel: mensaje en
 * español según lo que pasó y, en `details`, el estado y el texto que
 * devolvió Mercado Libre. Antes era un `Error` plano y el panel mostraba
 * «Error interno del servidor» para un 429, un token vencido o una ficha
 * borrada por igual.
 */
export class MercadoLibreRequestError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    public readonly upstreamStatus: number,
    details?: Record<string, unknown>,
  ) {
    super(message, statusCode, { upstreamStatus, ...details });
  }
}

function getUpstreamMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" && payload.trim() ? payload.trim().slice(0, 300) : null;
  }
  const record = payload as Record<string, unknown>;
  const causes = Array.isArray(record.cause)
    ? record.cause
        .map((cause) =>
          cause && typeof cause === "object" && typeof (cause as { message?: unknown }).message === "string"
            ? ((cause as { message: string }).message as string)
            : null,
        )
        .filter((value): value is string => Boolean(value))
    : [];
  const message =
    typeof record.message === "string"
      ? record.message
      : typeof record.error === "string"
        ? record.error
        : null;
  const combined = [message, ...causes].filter(Boolean).join(" · ");
  return combined ? combined.slice(0, 300) : null;
}

export function toMercadoLibreRequestError(
  status: number,
  payload: unknown,
  operation: "consulta" | "actualización" = "consulta",
): MercadoLibreRequestError {
  const upstreamMessage = getUpstreamMessage(payload);
  const details = upstreamMessage ? { upstreamMessage } : undefined;
  if (status === 401 || status === 403) {
    return new MercadoLibreRequestError(
      "Mercado Libre no autorizó la operación. Reconecta la cuenta de Mercado Libre y vuelve a intentarlo.",
      401,
      status,
      details,
    );
  }
  if (status === 404) {
    return new MercadoLibreRequestError(
      "Mercado Libre no encontró el recurso; la publicación puede haber sido eliminada o cerrada allá.",
      404,
      status,
      details,
    );
  }
  if (status === 429) {
    return new MercadoLibreRequestError(
      "Mercado Libre limitó las consultas por un momento. Espera unos segundos y vuelve a intentarlo.",
      429,
      status,
      details,
    );
  }
  if (status >= 500) {
    return new MercadoLibreRequestError(
      "Mercado Libre no está respondiendo. Intenta de nuevo en unos minutos.",
      502,
      status,
      details,
    );
  }
  return new MercadoLibreRequestError(
    operation === "consulta"
      ? `Mercado Libre rechazó la consulta (${status})${upstreamMessage ? `: ${upstreamMessage}` : ""}.`
      : `Mercado Libre rechazó la actualización (${status})${upstreamMessage ? `: ${upstreamMessage}` : ""}.`,
    400,
    status,
    details,
  );
}

function normalizeMercadoLibreResource(resource: string) {
  const url = new URL(resource, API_BASE_URL);
  if (url.origin !== API_BASE_URL || !url.pathname.startsWith("/")) {
    throw new Error("El recurso de Mercado Libre no es válido");
  }

  return url.toString();
}

export async function getMercadoLibreAccessToken(connectionId: string) {
  const connection = await prismadb.marketplaceConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: {
      id: true,
      status: true,
      encryptedAccessToken: true,
      encryptedRefreshToken: true,
      accessTokenExpiresAt: true,
      tokenVersion: true,
    },
  });
  const config = getMercadoLibreConfig();

  if (!connection.encryptedAccessToken || !connection.encryptedRefreshToken) {
    throw new AppError(
      "La conexión de Mercado Libre no tiene credenciales válidas. Reconecta la cuenta desde Resumen.",
      409,
    );
  }
  if (connection.status !== MarketplaceConnectionStatus.CONNECTED) {
    throw new AppError(
      "La conexión de Mercado Libre no está activa. Reconecta la cuenta desde Resumen.",
      409,
    );
  }

  const shouldRefresh =
    !connection.accessTokenExpiresAt ||
    connection.accessTokenExpiresAt.getTime() <=
      Date.now() + ACCESS_TOKEN_REFRESH_MARGIN_MS;
  if (!shouldRefresh) {
    return decryptMercadoLibreToken(
      connection.encryptedAccessToken,
      config.tokenEncryptionKey,
    );
  }

  const refreshedTokens = await refreshMercadoLibreAccessToken(
    config,
    decryptMercadoLibreToken(
      connection.encryptedRefreshToken,
      config.tokenEncryptionKey,
    ),
  );
  const expiresAt = new Date(
    Date.now() + refreshedTokens.expiresInSeconds * 1000,
  );
  const update = await prismadb.marketplaceConnection.updateMany({
    where: { id: connection.id, tokenVersion: connection.tokenVersion },
    data: {
      encryptedAccessToken: encryptMercadoLibreToken(
        refreshedTokens.accessToken,
        config.tokenEncryptionKey,
      ),
      encryptedRefreshToken: encryptMercadoLibreToken(
        refreshedTokens.refreshToken,
        config.tokenEncryptionKey,
      ),
      accessTokenExpiresAt: expiresAt,
      tokenVersion: { increment: 1 },
      lastError: null,
    },
  });

  if (update.count === 1) return refreshedTokens.accessToken;

  return getMercadoLibreAccessToken(connectionId);
}

export async function requestMercadoLibreJson(
  connectionId: string,
  resource: string,
  request: typeof fetch = fetch,
  headers: Record<string, string> = {},
) {
  const accessToken = await getMercadoLibreAccessToken(connectionId);
  const response = await request(normalizeMercadoLibreResource(resource), {
    headers: { Authorization: `Bearer ${accessToken}`, ...headers },
    cache: "no-store",
  });
  const body = await response.text();

  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok && payload !== null,
    status: response.status,
    payload,
  };
}

export async function mutateMercadoLibreJson(
  connectionId: string,
  resource: string,
  {
    method,
    body,
    headers = {},
  }: {
    method: "POST" | "PUT" | "DELETE";
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
  request: typeof fetch = fetch,
) {
  const accessToken = await getMercadoLibreAccessToken(connectionId);
  const response = await request(normalizeMercadoLibreResource(resource), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!response.ok) {
    await prismadb.marketplaceConnection.update({
      where: { id: connectionId },
      data: {
        lastError: `Mercado Libre rechazó la actualización (${response.status})`,
        ...(response.status === 401
          ? { status: MarketplaceConnectionStatus.REAUTH_REQUIRED }
          : {}),
      },
    });
    throw toMercadoLibreRequestError(response.status, payload, "actualización");
  }

  return payload;
}

export async function requestMercadoLibreResource(
  connectionId: string,
  resource: string,
  request: typeof fetch = fetch,
) {
  const result = await requestMercadoLibreJson(connectionId, resource, request);
  const payload =
    result.payload &&
    typeof result.payload === "object" &&
    !Array.isArray(result.payload)
      ? (result.payload as Record<string, unknown>)
      : null;

  return { ...result, ok: result.ok && Boolean(payload), payload };
}

export async function getMercadoLibreJson(
  connectionId: string,
  resource: string,
  request: typeof fetch = fetch,
  headers: Record<string, string> = {},
) {
  const result = await requestMercadoLibreJson(
    connectionId,
    resource,
    request,
    headers,
  );

  if (!result.ok) {
    await prismadb.marketplaceConnection.update({
      where: { id: connectionId },
      data: {
        lastError: `Mercado Libre rechazó la consulta del recurso (${result.status})`,
        ...(result.status === 401
          ? { status: MarketplaceConnectionStatus.REAUTH_REQUIRED }
          : {}),
      },
    });
    throw toMercadoLibreRequestError(result.status, result.payload, "consulta");
  }

  return result.payload;
}

export async function getMercadoLibreResource(
  connectionId: string,
  resource: string,
  request: typeof fetch = fetch,
) {
  const payload = await getMercadoLibreJson(connectionId, resource, request);
  const result =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;

  if (!result) {
    throw new MercadoLibreRequestError(
      "Mercado Libre devolvió una respuesta que no se pudo leer. Intenta de nuevo en unos minutos.",
      502,
      200,
    );
  }

  return result;
}
