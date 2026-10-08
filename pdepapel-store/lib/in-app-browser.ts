/**
 * Navegadores integrados de Instagram y Facebook (iOS y Android). Los
 * rastreadores de Meta (`facebookexternalhit`, `Facebot`) no cuentan.
 */
export const IN_APP_BROWSER_PATTERN = /Instagram|FBAN|FBAV/;

export function isInAppBrowser(userAgent: string | null | undefined) {
  return Boolean(userAgent) && IN_APP_BROWSER_PATTERN.test(userAgent as string);
}
