/**
 * Consentimiento para incrustar publicaciones de redes sociales en la página
 * «Nosotros». Cada embed carga scripts de Instagram, TikTok, Facebook, YouTube
 * o Pinterest que fijan sus propias cookies, así que no se cargan hasta que la
 * persona lo pide. Es independiente del consentimiento de analítica: es otro
 * propósito y otro tercero.
 */
export const SOCIAL_EMBEDS_CONSENT_VERSION = "v1";
export const SOCIAL_EMBEDS_CONSENT_STORAGE_KEY = `pdepapel:social-embeds-consent:${SOCIAL_EMBEDS_CONSENT_VERSION}`;

export function readSocialEmbedsConsent(): boolean {
  try {
    return window.localStorage.getItem(SOCIAL_EMBEDS_CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

export function writeSocialEmbedsConsent(granted: boolean): void {
  try {
    if (granted) {
      window.localStorage.setItem(SOCIAL_EMBEDS_CONSENT_STORAGE_KEY, "granted");
    } else {
      window.localStorage.removeItem(SOCIAL_EMBEDS_CONSENT_STORAGE_KEY);
    }
  } catch {
    // Sin almacenamiento (modo privado, bloqueo): la decisión vale solo para esta vista.
  }
}
