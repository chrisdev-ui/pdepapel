import { expect } from "vitest";

/**
 * Claves que nunca deben llegar al navegador, a cualquier profundidad de una
 * respuesta ya serializada. Para la dueña solo las credenciales; para la
 * cuenta de solo lectura además el dinero de la casa, el proveedor, los datos
 * de contacto de las clientas y lo que identifica un pago o un envío.
 */
const SECRET_KEYS = [
  "accessToken",
  "refreshToken",
  "clientSecret",
  "webhookSecret",
  "apiKey",
  "apiSecret",
  "secret",
  // Redes: la referencia del token, lo cifrado, el verifier de PKCE y la respuesta cruda.
  "tokenRef",
  "pageToken",
  "encryptedAccessToken",
  "encryptedRefreshToken",
  "encryptedCodeVerifier",
  "codeVerifier",
  "raw",
];

const VIEWER_KEYS = [
  // Costos, proveedor y señales internas del producto.
  "acqPrice",
  "transportationCost",
  "supplierId",
  "supplier",
  "soldCount",
  "abcClassification",
  "shippingProfileId",
  // Márgenes y pisos de precio.
  "minimumMarginAmount",
  "minimumMarginPct",
  "profitMarginPct",
  "netProfit",
  "totalProductCost",
  "gatewayFee",
  "productCost",
  "storeMinMarginPercent",
  "capsuleMinSlipCost",
  "capsuleMinMarginPct",
  "mercadoLibreTargetMarginPercent",
  "mercadoLibreMinNetPerUnit",
  "mercadoLibreLowPriceFixedFee",
  "medianMarkup",
  // Cápsulas por papeles: banda, costo congelado, tope del regalo, provisional y real.
  "costBandMin",
  "costBandMax",
  "unitCost",
  "totalCost",
  "giftMaxCost",
  "boxReserveCost",
  "provisionalCost",
  "realCost",
  // Contacto de clientas (y de quien recibe un envío o un regalo).
  "fullName",
  "phone",
  "email",
  "address",
  "address2",
  "addressReference",
  "neighborhood",
  "documentId",
  "company",
  "buyerName",
  "buyerEmail",
  "recipientName",
  "recipientEmail",
  "giftRecipientName",
  "giftRecipientEmail",
  "giftRecipientPhone",
  "destinationData",
  "originData",
  // Lo que identifica un pago, un envío o un enlace público.
  "transactionId",
  "trackingCode",
  "trackingNumber",
  "trackingUrl",
  "guideUrl",
  "token",
  "riskScore",
  "riskReasons",
  // Prueba de consentimiento del pedido (solo la dueña).
  "legalTermsVersion",
  "legalPrivacyVersion",
  "legalConsentAt",
  "legalConsentChannel",
  "whatsappOptInAt",
  "whatsappOptInVersion",
  "whatsappOptInSource",
  "whatsappOptInBy",
  "whatsappOptOutAt",
  "providerMessageId",
  // Reseñas: quién escribió y la moderación.
  "userId",
  "moderationNote",
  "moderatedBy",
  "repliedBy",
];

/**
 * Quien abre el recibo solo con el enlace: sin dirección, empresa, documento,
 * transacción, mensaje de regalo, notas, riesgo ni costos. Nombre, teléfono y
 * correo llegan recortados (se comprueban por valor) y la guía sí llega.
 */
const LINK_HOLDER_KEYS = [
  "address",
  "address2",
  "addressReference",
  "neighborhood",
  "company",
  "documentId",
  "transactionId",
  "giftMessage",
  "giftRecipientEmail",
  "giftRecipientPhone",
  "token",
  "riskScore",
  "riskReasons",
  "adminNotes",
  "internalNotes",
  "createdBy",
  "analyticsClientId",
  "analyticsSessionId",
  "acqPrice",
  "transportationCost",
  "supplierId",
  "netProfit",
  "totalProductCost",
  "gatewayFee",
  "shippingCost",
  "guideUrl",
  "destinationData",
  "originData",
  "legalTermsVersion",
  "legalPrivacyVersion",
  "legalConsentAt",
  "legalConsentChannel",
  "whatsappOptInAt",
  "whatsappOptInVersion",
  "whatsappOptInSource",
  "whatsappOptInBy",
  "whatsappOptOutAt",
  "providerMessageId",
];

export type PayloadRole = "owner" | "viewer" | "linkHolder";

const ROLE_KEYS: Record<PayloadRole, string[]> = {
  owner: SECRET_KEYS,
  viewer: [...SECRET_KEYS, ...VIEWER_KEYS],
  linkHolder: [...SECRET_KEYS, ...LINK_HOLDER_KEYS],
};

/** Las rutas (a.b[0].c) donde aparece alguna clave prohibida para el rol. */
export function findForbiddenKeys(payload: unknown, role: PayloadRole): string[] {
  const forbidden = new Set(ROLE_KEYS[role]);
  const found: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key;
      if (forbidden.has(key)) found.push(next);
      walk(child, next);
    }
  };
  // Lo que viaja es JSON: se mide sobre la forma serializada, no sobre objetos de Prisma.
  walk(JSON.parse(JSON.stringify(payload ?? null)), "");
  return found;
}

export function assertNoForbiddenKeys(payload: unknown, role: PayloadRole) {
  expect(findForbiddenKeys(payload, role), `claves prohibidas para «${role}»`).toEqual([]);
}
