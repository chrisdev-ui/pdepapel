import { decodeTokenKey } from "@/lib/token-crypto";

/**
 * Configuración de redes. Todo es opcional: sin las variables, la plataforma
 * sale «No configurada» y nada falla (como Mercado Libre, no pasa por env.mjs).
 */
type Environment = Record<string, string | undefined>;

export const GRAPH_API_VERSION = "v24.0";
export const INSTAGRAM_TOKEN_REF = "env:META_IG_PAGE_TOKEN";

export function getInstagramConfig(environment: Environment = process.env) {
  const pageToken = environment.META_IG_PAGE_TOKEN?.trim();
  return pageToken ? { pageToken } : null;
}

export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Buffer;
}

/** Lo que falta para TikTok, por nombre (nunca valores). */
export function getTikTokConfigurationStatus(environment: Environment = process.env) {
  const missing: string[] = [];
  if (environment.TIKTOK_ENABLED !== "true") missing.push("TIKTOK_ENABLED");
  for (const name of ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"]) {
    if (!environment[name]?.trim()) missing.push(name);
  }
  if (!decodeTokenKey(environment.SOCIAL_TOKEN_ENCRYPTION_KEY)) missing.push("SOCIAL_TOKEN_ENCRYPTION_KEY");
  return { configured: missing.length === 0, missing };
}

export function getTikTokConfig(environment: Environment = process.env): TikTokConfig | null {
  if (!getTikTokConfigurationStatus(environment).configured) return null;
  return {
    clientKey: environment.TIKTOK_CLIENT_KEY!.trim(),
    clientSecret: environment.TIKTOK_CLIENT_SECRET!.trim(),
    redirectUri: environment.TIKTOK_REDIRECT_URI!.trim(),
    encryptionKey: decodeTokenKey(environment.SOCIAL_TOKEN_ENCRYPTION_KEY)!,
  };
}

export function getSocialEncryptionKey(environment: Environment = process.env) {
  return decodeTokenKey(environment.SOCIAL_TOKEN_ENCRYPTION_KEY);
}
