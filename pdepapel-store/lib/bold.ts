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

export interface BoldCheckoutConfig {
  orderId: string;
  currency: string;
  amount: string;
  apiKey: string;
  integritySignature: string;
  redirectionUrl: string;
  description: string;
}

export function toBoldCheckoutConfig(
  payload: BoldCheckoutPayload,
): BoldCheckoutConfig {
  return {
    orderId: payload.orderNumber,
    currency: payload.currency,
    amount: String(payload.amount),
    apiKey: payload.identityKey,
    integritySignature: payload.integritySignature,
    redirectionUrl: payload.redirectionUrl,
    description: payload.description,
  };
}

export function getBoldStoreConfig() {
  return {
    identityKey: process.env.NEXT_PUBLIC_BOLD_IDENTITY_KEY || "",
    checkoutScriptUrl: "https://checkout.bold.co/library/boldPaymentButton.js",
  };
}
