import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * El enlace del panel trae `exp.firma`. La firma usa REVALIDATION_SECRET, que
 * ya es igual en las dos apps, con un prefijo propio para que no sirva para
 * nada más. Misma regla en `pdepapel-admin/lib/team-browser-link.ts`.
 */
const PURPOSE = "pdepapel:team-browser:v1";
/** Lo que dura el enlace después de generarlo en el panel. */
export const TEAM_BROWSER_TOKEN_MAX_AGE_MS = 10 * 60 * 1000;

function sign(expiresAt: number, secret: string): string {
  return createHmac("sha256", secret).update(`${PURPOSE}:${expiresAt}`).digest("base64url");
}

export function verifyTeamBrowserToken(
  token: string | null | undefined,
  secret: string | undefined = process.env.REVALIDATION_SECRET?.trim(),
  now = Date.now(),
): boolean {
  if (!token || !secret) return false;
  const [expiresRaw, signature] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isInteger(expiresAt) || !signature) return false;
  if (expiresAt < now || expiresAt > now + TEAM_BROWSER_TOKEN_MAX_AGE_MS) return false;
  const expected = Buffer.from(sign(expiresAt, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
