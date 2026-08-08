import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { getMercadoLibreConfig } from "@/lib/mercadolibre/config";
import { encryptMercadoLibreToken } from "@/lib/mercadolibre/crypto";
import {
  exchangeMercadoLibreAuthorizationCode,
  getMercadoLibreProfile,
} from "@/lib/mercadolibre/oauth";
import { consumeMercadoLibreOAuthState } from "@/lib/mercadolibre/oauth-state";
import { ensureMercadoLibreRecoverySchedule } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";

function redirectToMarketplace(
  storeId: string | null,
  result: "connected" | "error",
  reason?: "invalid_state" | "configuration" | "authorization",
) {
  const adminUrl = process.env.ADMIN_WEB_URL;
  if (!adminUrl) {
    return NextResponse.json(
      { error: "No fue posible redirigir a la administración" },
      { status: 500 },
    );
  }

  const path = storeId ? `/${encodeURIComponent(storeId)}/mercadolibre` : "/";
  const url = new URL(path, adminUrl);
  url.searchParams.set("mercadolibre", result);
  if (reason) url.searchParams.set("reason", reason);

  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return redirectToMarketplace(null, "error", "invalid_state");
  }

  const oauthState = await consumeMercadoLibreOAuthState(state);
  if (!oauthState) {
    return redirectToMarketplace(null, "error", "invalid_state");
  }

  try {
    const config = getMercadoLibreConfig();
    const tokens = await exchangeMercadoLibreAuthorizationCode(config, code);
    const profile = await getMercadoLibreProfile(tokens.accessToken);

    if (profile.siteId && profile.siteId !== "MCO") {
      throw new Error(
        "La cuenta autorizada no pertenece a Mercado Libre Colombia",
      );
    }

    const expiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000);
    const connection = await prismadb.marketplaceConnection.upsert({
      where: {
        storeId_provider: {
          storeId: oauthState.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      update: {
        sellerId: profile.id,
        siteId: profile.siteId ?? "MCO",
        status: MarketplaceConnectionStatus.CONNECTED,
        encryptedAccessToken: encryptMercadoLibreToken(
          tokens.accessToken,
          config.tokenEncryptionKey,
        ),
        encryptedRefreshToken: encryptMercadoLibreToken(
          tokens.refreshToken,
          config.tokenEncryptionKey,
        ),
        accessTokenExpiresAt: expiresAt,
        tokenVersion: { increment: 1 },
        lastError: null,
      },
      create: {
        storeId: oauthState.storeId,
        provider: MarketplaceProvider.MERCADOLIBRE,
        sellerId: profile.id,
        siteId: profile.siteId ?? "MCO",
        status: MarketplaceConnectionStatus.CONNECTED,
        encryptedAccessToken: encryptMercadoLibreToken(
          tokens.accessToken,
          config.tokenEncryptionKey,
        ),
        encryptedRefreshToken: encryptMercadoLibreToken(
          tokens.refreshToken,
          config.tokenEncryptionKey,
        ),
        accessTokenExpiresAt: expiresAt,
        tokenVersion: 1,
      },
    });
    try {
      await ensureMercadoLibreRecoverySchedule(connection.id);
    } catch (error) {
      console.error("Mercado Libre recovery schedule setup failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }

    return redirectToMarketplace(oauthState.storeId, "connected");
  } catch (error) {
    console.error("Mercado Libre OAuth callback failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    const reason =
      error instanceof Error && error.name === "MercadoLibreConfigurationError"
        ? "configuration"
        : "authorization";
    return redirectToMarketplace(oauthState.storeId, "error", reason);
  }
}
