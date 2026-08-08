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

export async function getMercadoLibreResource(
  connectionId: string,
  resource: string,
  request: typeof fetch = fetch,
) {
  const accessToken = await getMercadoLibreAccessToken(connectionId);
  const response = await request(normalizeMercadoLibreResource(resource), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = await response.text();

  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || typeof payload !== "object") {
    await prismadb.marketplaceConnection.update({
      where: { id: connectionId },
      data: {
        lastError: `Mercado Libre rechazó la consulta del recurso (${response.status})`,
        ...(response.status === 401
          ? { status: MarketplaceConnectionStatus.REAUTH_REQUIRED }
          : {}),
      },
    });
    throw new Error(
      `No fue posible consultar Mercado Libre (${response.status})`,
    );
  }

  return payload as Record<string, unknown>;
}
