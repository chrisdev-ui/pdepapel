import { getBoldStoreConfig, toBoldCheckoutConfig } from "@/lib/bold";
import { afterEach, describe, expect, it } from "vitest";

const initialIdentityKey = process.env.NEXT_PUBLIC_BOLD_IDENTITY_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_BOLD_IDENTITY_KEY = initialIdentityKey;
});

describe("Bold checkout configuration", () => {
  it("transforms the backend payload into the client SDK contract", () => {
    expect(
      toBoldCheckoutConfig({
        orderId: "internal-order-id",
        orderNumber: "ORD-123",
        amount: 80500,
        currency: "COP",
        identityKey: "identity-key",
        integritySignature: "signature",
        redirectionUrl:
          "https://papeleriapdepapel.com/pedido/internal-order-id",
        description: "Orden P de Papel ORD-123",
      }),
    ).toEqual({
      orderId: "ORD-123",
      amount: "80500",
      apiKey: "identity-key",
      currency: "COP",
      integritySignature: "signature",
      redirectionUrl: "https://papeleriapdepapel.com/pedido/internal-order-id",
      description: "Orden P de Papel ORD-123",
    });
  });

  it("uses the public identity key and the official Bold SDK URL", () => {
    process.env.NEXT_PUBLIC_BOLD_IDENTITY_KEY = "public-key";

    expect(getBoldStoreConfig()).toEqual({
      identityKey: "public-key",
      checkoutScriptUrl:
        "https://checkout.bold.co/library/boldPaymentButton.js",
    });
  });
});
