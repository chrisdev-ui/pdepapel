import { env } from "@/lib/env.mjs";

/**
 * El enlace de baja de todo correo de marketing: el GET cancela y vuelve a la
 * tienda; el POST de un clic (RFC 8058) cancela sin abrir nada.
 */
export function newsletterUnsubscribeUrl(storeId: string, unsubscribeTokenHash: string) {
  return new URL(
    `/api/${encodeURIComponent(storeId)}/newsletter/unsubscribe?hash=${encodeURIComponent(unsubscribeTokenHash)}`,
    `${env.ADMIN_WEB_URL.replace(/\/$/, "")}/`,
  ).toString();
}

export function listUnsubscribeHeaders(url: string) {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
