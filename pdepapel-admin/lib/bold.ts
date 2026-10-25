import crypto from "crypto";
import { getAmountDue } from "@/lib/gift-card-amounts";
import { fetchGatewayJson, type GatewayFetchOptions, type GatewayLookup } from "@/lib/payment-gateway-lookup";

export interface BoldCheckoutPayload {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  identityKey: string;
  integritySignature: string;
  redirectionUrl: string;
  description: string;
}

/**
 * Calculates SHA-256 integrity signature according to official Bold Colombia specifications.
 * Formula: SHA256(order_id + amount + currency + secret_key)
 */
export function generateBoldIntegritySignature(
  orderId: string,
  amount: number,
  currency = "COP",
  secretKey = process.env.BOLD_SECRET_KEY || "",
): string {
  if (!secretKey) {
    throw new Error("BOLD_SECRET_KEY is not defined in environment variables");
  }
  const rawString = `${orderId}${amount}${currency}${secretKey}`;
  return crypto.createHash("sha256").update(rawString).digest("hex");
}

/**
 * Returns the stable external reference that Bold sends back in
 * `data.metadata.reference` in its webhook payload.
 */
export function getBoldOrderReference(order: {
  id: string;
  orderNumber?: string | null;
}): string {
  const reference = order.orderNumber || order.id;

  if (!/^[A-Za-z0-9_-]{1,60}$/.test(reference)) {
    throw new Error("La referencia de orden para Bold no es válida");
  }

  return reference;
}

/**
 * Verifies the HMAC signature documented by Bold for webhook requests.
 */
export function verifyBoldWebhookSignature(
  rawPayload: string,
  signature: string | null,
  secretKey: string,
): boolean {
  if (!signature) return false;
  // Una clave vacía es una clave HMAC válida: sin este corte, cualquiera
  // podría firmar un pago cuando BOLD_SECRET_KEY falta o el entorno es "test".
  if (!secretKey) {
    console.error("[BOLD] BOLD_SECRET_KEY vacía: no se puede verificar la firma");
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(Buffer.from(rawPayload, "utf8").toString("base64"))
    .digest("hex");
  const receivedSignature = signature.trim();

  return (
    receivedSignature.length === expectedSignature.length &&
    crypto.timingSafeEqual(
      Buffer.from(receivedSignature, "utf8"),
      Buffer.from(expectedSignature, "utf8"),
    )
  );
}

/**
 * Clave con la que Bold firma sus webhooks. Es la misma en pruebas y en
 * producción: el entorno cambia las credenciales, no si se verifica la firma.
 */
export function getBoldWebhookSecretKey(): string {
  return process.env.BOLD_SECRET_KEY || "";
}

/**
 * Generates pre-signed Bold checkout payload for direct checkout creation
 */
export function generateBoldCheckoutData(order: any) {
  const boldConfig = getBoldConfig();
  const boldOrderReference = getBoldOrderReference(order);
  // Lo que cobra Bold: el total menos lo que cubrió una tarjeta de regalo.
  const amount = Math.round(getAmountDue(order));
  const currency = "COP";
  const integritySignature = generateBoldIntegritySignature(
    boldOrderReference,
    amount,
    currency,
    boldConfig.secretKey,
  );
  let storeUrl =
    process.env.FRONTEND_STORE_URL || "https://papeleriapdepapel.com";
  if (storeUrl.includes("localhost")) {
    storeUrl = "https://papeleriapdepapel.com";
  } else if (storeUrl.startsWith("http://")) {
    storeUrl = storeUrl.replace(/^http:\/\//, "https://");
  }
  const redirectionUrl = `${storeUrl}/pedido/${order.id}`;

  return {
    orderId: order.id,
    orderNumber: boldOrderReference,
    amount,
    currency,
    identityKey: boldConfig.identityKey,
    integritySignature,
    redirectionUrl,
    description: `Orden P de Papel ${order.orderNumber || order.id}`,
  };
}

/**
 * Returns Bold credentials based on current BOLD_ENVIRONMENT (test vs production)
 */
export function getBoldConfig() {
  const isProd = process.env.BOLD_ENVIRONMENT === "production";
  return {
    isProd,
    identityKey: process.env.NEXT_PUBLIC_BOLD_IDENTITY_KEY || "",
    secretKey: process.env.BOLD_SECRET_KEY || "",
    datafonoIdentityKey: process.env.BOLD_DATAFONO_IDENTITY_KEY || "",
    datafonoSecretKey: process.env.BOLD_DATAFONO_SECRET_KEY || "",
    datafonoSn: process.env.BOLD_DATAFONO_SN || "01233050202505074185",
    datafonoTag: process.env.BOLD_DATAFONO_TAG || "D204185",
    baseUrl: isProd
      ? "https://integrations.api.bold.co"
      : "https://integrations.api.bold.co", // Same base URL, governed by API Keys
  };
}

export interface BoldPaymentVoucher {
  transaction_id?: string | null;
  reference_id?: string | null;
  total?: number | string | null;
  subtotal?: number | string | null;
  tip?: number | string | null;
  tip_amount?: number | string | null;
  payment_status: string;
  payment_method?: string | null;
  transaction_date?: string | number | null;
}

const BOLD_VOUCHER_URL = "https://payments.api.bold.co/v2/payment-voucher";
const BOLD_AUTH_ERROR = /unauthori[sz]ed|forbidden|api[ _-]?key|credencial|llave|autenticaci/i;

/**
 * Estado de una venta del Botón de pagos por nuestra referencia
 * (`getBoldOrderReference`), con la llave de identidad. Bold la muestra hasta
 * 10 min después y solo durante 24 h; `NO_TRANSACTION_FOUND` y 404 son «sin
 * intento de pago».
 */
export async function getBoldPaymentVoucher(
  reference: string,
  identityKey: string,
  options: GatewayFetchOptions = {},
): Promise<GatewayLookup<BoldPaymentVoucher>> {
  const result = await fetchGatewayJson(
    `${BOLD_VOUCHER_URL}/${encodeURIComponent(reference)}`,
    { authorization: `x-api-key ${identityKey}` },
    options,
  );
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return { kind: "key-rejected", status: result.status };
    if (result.status === 400 && BOLD_AUTH_ERROR.test(JSON.stringify(result.body ?? ""))) return { kind: "key-rejected", status: 400 };
    if (result.status === 404) return { kind: "none" };
    return { kind: "unavailable", status: result.status, reason: result.reason };
  }
  const voucher = result.body?.payment_status ? result.body : result.body?.data;
  if (!voucher || typeof voucher.payment_status !== "string" || voucher.payment_status === "NO_TRANSACTION_FOUND") return { kind: "none" };
  return { kind: "found", items: [voucher as BoldPaymentVoucher] };
}
