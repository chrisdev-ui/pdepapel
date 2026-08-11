import { MarketplaceConnectionStatus } from "@prisma/client";

import { getMercadoLibreConfig } from "./config";
import { decryptMercadoLibreToken, encryptMercadoLibreToken } from "./crypto";
import { refreshMercadoLibreAccessToken } from "./oauth";
import prismadb from "@/lib/prismadb";

const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000;
const API_BASE_URL = "https://api.mercadolibre.com";

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
    throw new Error(
      "La conexión de Mercado Libre no tiene credenciales válidas",
    );
  }
  if (connection.status !== MarketplaceConnectionStatus.CONNECTED) {
    throw new Error("La conexión de Mercado Libre no está activa");
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
  }: {
    method: "POST" | "PUT" | "DELETE";
    body?: Record<string, unknown>;
  },
  request: typeof fetch = fetch,
) {
  const accessToken = await getMercadoLibreAccessToken(connectionId);
  const response = await request(normalizeMercadoLibreResource(resource), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
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
    throw new Error(
      `Mercado Libre rechazó la actualización (${response.status})`,
    );
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
    throw new Error(
      `No fue posible consultar Mercado Libre (${result.status})`,
    );
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
    throw new Error("Mercado Libre devolvió una respuesta inválida");
  }

  return result;
}
