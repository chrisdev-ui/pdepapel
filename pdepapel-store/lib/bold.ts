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

export function getBoldStoreConfig() {
  return {
    identityKey: process.env.NEXT_PUBLIC_BOLD_IDENTITY_KEY || "",
    checkoutScriptUrl: "https://checkout.bold.co/library/boldPaymentButton.js",
  };
}
