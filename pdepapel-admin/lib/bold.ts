import crypto from "crypto";

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
 * Generates pre-signed Bold checkout payload for direct checkout creation
 */
export function generateBoldCheckoutData(order: any) {
  const boldConfig = getBoldConfig();
  const boldOrderReference = getBoldOrderReference(order);
  const amount = Math.round(order.total);
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
  const redirectionUrl = `${storeUrl}/order/${order.id}`;

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
