import { SocialPlatform } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

/**
 * Tokens de TikTok en la base, siempre cifrados. Se refrescan 60 s antes de
 * vencer; `tokenVersion` evita que dos corridas a la vez se pisen el refresh
 * token (TikTok puede rotarlo en cada refresco).
 */
const REFRESH_MARGIN_MS = 60_000;

export interface TikTokTokenSet {
  accessToken: string;
  refreshToken: string;
  /** Segundos. */
  expiresIn: number;
  refreshExpiresIn: number;
  scope: string | null;
  openId: string;
}

/** La cuenta necesita que la dueña la vuelva a conectar; `reason` es un código corto. */
export class SocialReconnectRequired extends Error {
  constructor(public readonly reason: string) {
    super(`Hay que volver a conectar la cuenta (${reason})`);
    this.name = "SocialReconnectRequired";
  }
}

const inSeconds = (now: Date, seconds: number) => new Date(now.getTime() + seconds * 1000);

export async function saveTikTokCredential(storeId: string, tokens: TikTokTokenSet, key: Buffer, now = new Date()) {
  const data = {
    encryptedAccessToken: encryptToken(tokens.accessToken, key),
    encryptedRefreshToken: encryptToken(tokens.refreshToken, key),
    accessTokenExpiresAt: inSeconds(now, tokens.expiresIn),
    refreshTokenExpiresAt: inSeconds(now, tokens.refreshExpiresIn),
    scope: tokens.scope?.slice(0, 255) ?? null,
  };
  const row = await prismadb.socialCredential.upsert({
    where: { storeId_platform: { storeId, platform: SocialPlatform.TIKTOK } },
    create: { storeId, platform: SocialPlatform.TIKTOK, ...data },
    update: { ...data, tokenVersion: { increment: 1 } },
    select: { id: true },
  });
  return row.id;
}

export async function getTikTokAccessToken(
  storeId: string,
  options: { key: Buffer; refresh: (refreshToken: string) => Promise<TikTokTokenSet>; now?: Date },
): Promise<string> {
  const now = options.now ?? new Date();
  const credential = await prismadb.socialCredential.findUnique({
    where: { storeId_platform: { storeId, platform: SocialPlatform.TIKTOK } },
  });
  if (!credential) throw new SocialReconnectRequired("tiktok_not_connected");
  if (credential.accessTokenExpiresAt && credential.accessTokenExpiresAt.getTime() - now.getTime() > REFRESH_MARGIN_MS) {
    return decryptToken(credential.encryptedAccessToken, options.key);
  }
  if (!credential.encryptedRefreshToken || (credential.refreshTokenExpiresAt && credential.refreshTokenExpiresAt <= now)) {
    throw new SocialReconnectRequired("tiktok_refresh_expired");
  }

  const tokens = await options.refresh(decryptToken(credential.encryptedRefreshToken, options.key));
  const claim = await prismadb.socialCredential.updateMany({
    where: { id: credential.id, tokenVersion: credential.tokenVersion },
    data: {
      encryptedAccessToken: encryptToken(tokens.accessToken, options.key),
      encryptedRefreshToken: encryptToken(tokens.refreshToken, options.key),
      accessTokenExpiresAt: inSeconds(now, tokens.expiresIn),
      refreshTokenExpiresAt: inSeconds(now, tokens.refreshExpiresIn),
      scope: tokens.scope?.slice(0, 255) ?? credential.scope,
      tokenVersion: { increment: 1 },
    },
  });
  if (claim.count === 1) return tokens.accessToken;

  // Otra corrida refrescó primero: su token es el vigente.
  const latest = await prismadb.socialCredential.findUniqueOrThrow({ where: { id: credential.id } });
  return decryptToken(latest.encryptedAccessToken, options.key);
}
