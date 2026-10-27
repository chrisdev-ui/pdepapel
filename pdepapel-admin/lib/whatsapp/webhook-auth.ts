import { safeSecretEquals, WEBHOOK_TOKEN_HEADER } from "@/lib/webhook-auth";
import { verifyWhatsAppWebhookSignature } from "@/lib/whatsapp/webhook";

export const CHAKRA_SIGNATURE_HEADER = "x-chakra-signature-256";
export const META_SIGNATURE_HEADER = "x-hub-signature-256";

export type WhatsAppWebhookAuthMethod = "chakra_hmac" | "meta_hmac" | "token_header" | "token_query" | "rejected";

/** Resultado de la firma de Chakra cuando hay secreto; `null` sin secreto (no se puede comprobar). */
export type ChakraSignatureCheck = "chakra_hmac_valid" | "chakra_hmac_invalid" | "chakra_hmac_missing";

export interface WhatsAppWebhookAuth {
  method: WhatsAppWebhookAuthMethod;
  /** Dónde vino el token, sea válido o no: decide cómo rotarlo sin romper la entrega. */
  tokenVia: "header" | "query" | "none";
  /** Si la entrega traía la cabecera de Chakra, aunque todavía no haya secreto para comprobarla. */
  chakraSignature: "present" | "absent";
  chakraCheck: ChakraSignatureCheck | null;
  /** Firmado de verdad (Chakra o Meta). Solo esto deja correr un comando. */
  signed: boolean;
}

export interface WhatsAppWebhookSecrets {
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  CHAKRA_WEBHOOK_SECRET?: string;
  CHAKRA_WEBHOOK_ENFORCE?: string;
}

export const isChakraEnforced = (secrets: WhatsAppWebhookSecrets) =>
  Boolean(secrets.CHAKRA_WEBHOOK_SECRET) && /^(true|1)$/i.test(secrets.CHAKRA_WEBHOOK_ENFORCE?.trim() ?? "");

/**
 * Tres modos. Sin `CHAKRA_WEBHOOK_SECRET`: el token vale como siempre. Con el
 * secreto y sin `CHAKRA_WEBHOOK_ENFORCE`: se comprueba la firma y se anota el
 * resultado, pero se autentica igual que sin él (nada se rechaza por la
 * firma). Con los dos: solo pasa lo firmado, porque el token viaja en la URL
 * y quien lo tenga podría inventar un cuerpo.
 */
export function authenticateWhatsAppWebhook(request: Request, rawBody: string, secrets: WhatsAppWebhookSecrets): WhatsAppWebhookAuth {
  const header = request.headers.get(WEBHOOK_TOKEN_HEADER)?.trim() || null;
  const query = header ? null : new URL(request.url).searchParams.get("token")?.trim() || null;
  const tokenVia = header ? "header" : query ? "query" : "none";
  const chakraHeader = request.headers.get(CHAKRA_SIGNATURE_HEADER);
  const chakraValid = verifyWhatsAppWebhookSignature(rawBody, chakraHeader, secrets.CHAKRA_WEBHOOK_SECRET);
  const chakraCheck: ChakraSignatureCheck | null = !secrets.CHAKRA_WEBHOOK_SECRET
    ? null
    : chakraValid
      ? "chakra_hmac_valid"
      : chakraHeader
        ? "chakra_hmac_invalid"
        : "chakra_hmac_missing";
  const base = { tokenVia, chakraSignature: chakraHeader ? "present" : "absent", chakraCheck } as const;

  if (chakraValid) return { ...base, method: "chakra_hmac", signed: true };
  if (verifyWhatsAppWebhookSignature(rawBody, request.headers.get(META_SIGNATURE_HEADER), secrets.WHATSAPP_APP_SECRET)) {
    return { ...base, method: "meta_hmac", signed: true };
  }
  if (!isChakraEnforced(secrets) && safeSecretEquals(header ?? query, secrets.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    return { ...base, method: header ? "token_header" : "token_query", signed: false };
  }
  return { ...base, method: "rejected", signed: false };
}
