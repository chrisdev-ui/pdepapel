import { createHash, randomBytes } from "node:crypto";

import { MarketplaceProvider } from "@prisma/client";

import prismadb from "@/lib/prismadb";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function hashState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export async function createMercadoLibreOAuthState(
  storeId: string,
  createdBy: string,
) {
  const state = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MS);

  await prismadb.$transaction(async (tx) => {
    await tx.marketplaceOAuthState.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    await tx.marketplaceOAuthState.create({
      data: {
        storeId,
        createdBy,
        provider: MarketplaceProvider.MERCADOLIBRE,
        stateHash: hashState(state),
        expiresAt,
      },
    });
  });

  return state;
}

export async function consumeMercadoLibreOAuthState(state: string) {
  const now = new Date();
  const stateHash = hashState(state);

  return prismadb.$transaction(async (tx) => {
    const oauthState = await tx.marketplaceOAuthState.findUnique({
      where: { stateHash },
    });
    if (
      !oauthState ||
      oauthState.provider !== MarketplaceProvider.MERCADOLIBRE ||
      oauthState.consumedAt ||
      oauthState.expiresAt <= now
    ) {
      return null;
    }

    const claim = await tx.marketplaceOAuthState.updateMany({
      where: {
        id: oauthState.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    return claim.count === 1 ? oauthState : null;
  });
}
