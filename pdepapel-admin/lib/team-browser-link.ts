import { createHmac } from "node:crypto";

/**
 * Enlace firmado que marca un navegador como del equipo en la tienda
 * (`/equipo?t=exp.firma`): GA4 lo cuenta como tráfico interno y Clarity no
 * graba. La firma usa REVALIDATION_SECRET, igual en las dos apps, con un
 * prefijo propio. Misma regla en `pdepapel-store/lib/team-browser-token.ts`.
 */
const PURPOSE = "pdepapel:team-browser:v1";
export const TEAM_BROWSER_LINK_TTL_MS = 5 * 60 * 1000;

export function signTeamBrowserToken(secret: string, now = Date.now()): string {
  const expiresAt = now + TEAM_BROWSER_LINK_TTL_MS;
  const signature = createHmac("sha256", secret).update(`${PURPOSE}:${expiresAt}`).digest("base64url");
  return `${expiresAt}.${signature}`;
}

function storeOrigin(storeUrl: string): string {
  return storeUrl.trim().replace(/\/+$/, "");
}

export function buildTeamBrowserLinks(storeUrl: string, secret: string, now = Date.now()) {
  const origin = storeOrigin(storeUrl);
  return {
    markUrl: `${origin}/equipo?t=${encodeURIComponent(signTeamBrowserToken(secret, now))}`,
    unmarkUrl: `${origin}/equipo?salir=1`,
  };
}
