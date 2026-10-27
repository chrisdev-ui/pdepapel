import { safeSecretEquals, WEBHOOK_TOKEN_HEADER } from "@/lib/webhook-auth";
import { verifyWhatsAppWebhookSignature } from "@/lib/whatsapp/webhook";

export const CHAKRA_SIGNATURE_HEADER = "x-chakra-signature-256";
export const META_SIGNATURE_HEADER = "x-hub-signature-256";

export type WhatsAppWebhookAuthMethod = "chakra_hmac" | "meta_hmac" | "token_header" | "token_query" | "rejected";

export interface WhatsAppWebhookAuth {
  method: WhatsAppWebhookAuthMethod;
  /** Dónde vino el token, sea válido o no: decide cómo rotarlo sin romper la entrega. */
  tokenVia: "header" | "query" | "none";
  /** Si la entrega traía la cabecera de Chakra, aunque todavía no haya secreto para comprobarla. */
  chakraSignature: "present" | "absent";
  /** Firmado de verdad (Chakra o Meta). Solo esto deja correr un comando. */
  signed: boolean;
}

export interface WhatsAppWebhookSecrets {
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  CHAKRA_WEBHOOK_SECRET?: string;
}

/**
 * Con `CHAKRA_WEBHOOK_SECRET` puesto, solo pasa lo firmado: el token viaja
 * en la URL y quien lo tenga podría inventar un cuerpo. Sin él, el token
 * sigue valiendo como antes, para que una variable que falte no tumbe el
 * webhook.
 */
export function authenticateWhatsAppWebhook(request: Request, rawBody: string, secrets: WhatsAppWebhookSecrets): WhatsAppWebhookAuth {
  const header = request.headers.get(WEBHOOK_TOKEN_HEADER)?.trim() || null;
  const query = header ? null : new URL(request.url).searchParams.get("token")?.trim() || null;
  const tokenVia = header ? "header" : query ? "query" : "none";
  const chakraHeader = request.headers.get(CHAKRA_SIGNATURE_HEADER);
  const base = { tokenVia, chakraSignature: chakraHeader ? "present" : "absent" } as const;

  if (verifyWhatsAppWebhookSignature(rawBody, chakraHeader, secrets.CHAKRA_WEBHOOK_SECRET)) {
    return { ...base, method: "chakra_hmac", signed: true };
  }
  if (verifyWhatsAppWebhookSignature(rawBody, request.headers.get(META_SIGNATURE_HEADER), secrets.WHATSAPP_APP_SECRET)) {
    return { ...base, method: "meta_hmac", signed: true };
  }
  if (!secrets.CHAKRA_WEBHOOK_SECRET && safeSecretEquals(header ?? query, secrets.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    return { ...base, method: header ? "token_header" : "token_query", signed: false };
  }
  return { ...base, method: "rejected", signed: false };
}
