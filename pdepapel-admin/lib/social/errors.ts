import type { SocialPlatform } from "@prisma/client";

/**
 * Errores de las APIs de redes sin URL, token ni cuerpo: solo la red, el
 * estado HTTP y un código corto que se puede guardar y mostrar.
 */
export type SocialApiErrorKind = "auth" | "rate_limit" | "invalid_metric" | "http";

export class SocialApiError extends Error {
  constructor(
    public readonly platform: SocialPlatform,
    public readonly kind: SocialApiErrorKind,
    public readonly code: string,
    public readonly status: number | null,
    /** Para `rate_limit`: cuánto esperar antes de volver a intentar. */
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(`[${platform}] ${kind} ${code}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "SocialApiError";
  }
}
