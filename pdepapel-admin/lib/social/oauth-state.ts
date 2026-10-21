import { createHash, randomBytes } from "node:crypto";

import type { SocialPlatform } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

/**
 * State de OAuth de un solo uso con el code_verifier de PKCE. Solo el hash del
 * state y el verifier cifrado llegan a la base; los dos viven 10 minutos.
 */
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const VERIFIER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

const hashState = (state: string) => createHash("sha256").update(state).digest("hex");

/** 64 caracteres del alfabeto sin reservar de RFC 7636. */
export function createCodeVerifier() {
  const bytes = randomBytes(64);
  return Array.from(bytes, (byte) => VERIFIER_ALPHABET[byte % VERIFIER_ALPHABET.length]).join("");
}

export async function createSocialOAuthState(input: { storeId: string; platform: SocialPlatform; createdBy: string; encryptionKey: Buffer }) {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = createCodeVerifier();
  const now = new Date();
  await prismadb.$transaction(async (tx) => {
    await tx.socialOAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
    await tx.socialOAuthState.create({
      data: {
        storeId: input.storeId,
        platform: input.platform,
        createdBy: input.createdBy,
        stateHash: hashState(state),
        encryptedCodeVerifier: encryptToken(codeVerifier, input.encryptionKey),
        expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
      },
    });
  });
  return { state, codeVerifier };
}

/** Reclama el state una sola vez; null si no existe, venció, ya se usó o es de otra red. */
export async function consumeSocialOAuthState(state: string, platform: SocialPlatform, encryptionKey: Buffer) {
  const now = new Date();
  return prismadb.$transaction(async (tx) => {
    const row = await tx.socialOAuthState.findUnique({ where: { stateHash: hashState(state) } });
    if (!row || row.platform !== platform || row.consumedAt || row.expiresAt <= now) return null;
    const claim = await tx.socialOAuthState.updateMany({
      where: { id: row.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (claim.count !== 1) return null;
    return { storeId: row.storeId, createdBy: row.createdBy, codeVerifier: decryptToken(row.encryptedCodeVerifier, encryptionKey) };
  });
}
