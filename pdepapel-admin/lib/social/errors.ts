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

/** Lo que ve la dueña al conectar Instagram: cada causa con su arreglo; «no respondió» solo si de verdad no respondió. */
export function describeInstagramConnectError(error: SocialApiError): { status: number; message: string } {
  if (error.code === "meta_not_page_token") {
    return { status: 422, message: "El token guardado en el servidor (META_IG_PAGE_TOKEN) es de usuario, no de página. Hay que reemplazarlo por el token de la página de Facebook ligada a Instagram." };
  }
  if (error.code === "meta_no_ig_account") {
    return { status: 422, message: "La página de Facebook del token no tiene una cuenta profesional de Instagram ligada." };
  }
  if (error.kind === "auth") return { status: 422, message: "Meta rechazó el token de la página (vencido o revocado). Hay que generar uno nuevo." };
  if (error.kind === "rate_limit") return { status: 503, message: "Meta pidió esperar por el límite de uso; intenta de nuevo en unos minutos." };
  if (error.code === "network" || (error.status ?? 0) >= 500) return { status: 502, message: "Meta no respondió; intenta de nuevo en unos minutos." };
  return {
    status: 502,
    message: `Meta rechazó la consulta (${error.code}). Revisa los permisos del token de la página: instagram_basic, instagram_manage_insights, pages_show_list y pages_read_engagement.`,
  };
}
