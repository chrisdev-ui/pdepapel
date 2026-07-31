import {
  generateBoldCheckoutData,
  generateBoldIntegritySignature,
  getBoldConfig,
  getBoldOrderReference,
  getBoldWebhookSecretKey,
  verifyBoldWebhookSignature,
} from "@/lib/bold";
import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";

const initialBoldEnvironment = process.env.BOLD_ENVIRONMENT;
const initialBoldSecretKey = process.env.BOLD_SECRET_KEY;
const initialBoldIdentityKey = process.env.NEXT_PUBLIC_BOLD_IDENTITY_KEY;
const initialStoreUrl = process.env.FRONTEND_STORE_URL;

afterEach(() => {
  process.env.BOLD_ENVIRONMENT = initialBoldEnvironment;
  process.env.BOLD_SECRET_KEY = initialBoldSecretKey;
  process.env.NEXT_PUBLIC_BOLD_IDENTITY_KEY = initialBoldIdentityKey;
  process.env.FRONTEND_STORE_URL = initialStoreUrl;
});

describe("Bold helpers", () => {
  it("creates the documented integrity signature", () => {
    expect(
      generateBoldIntegritySignature("ORD-123", 80000, "COP", "secret"),
    ).toBe("77d7c5918ff039205364cf361a17d5749dae0d5efabd49c6bece584809398e0d");
  });

  it("uses the stable order number and rejects invalid references", () => {
    expect(
      getBoldOrderReference({ id: "order-id", orderNumber: "ORD_123" }),
    ).toBe("ORD_123");
    expect(() => getBoldOrderReference({ id: "order reference" })).toThrow(
      "no es válida",
    );
  });

  it("validates authentic webhook signatures and rejects tampered payloads", () => {
    const payload = '{"type":"SALE_APPROVED"}';
    const secret = "webhook-secret";
    const signature = crypto
      .createHmac("sha256", secret)
      .update(Buffer.from(payload, "utf8").toString("base64"))
      .digest("hex");

    expect(verifyBoldWebhookSignature(payload, signature, secret)).toBe(true);
    expect(verifyBoldWebhookSignature(`${payload} `, signature, secret)).toBe(
      false,
    );
    expect(verifyBoldWebhookSignature(payload, null, secret)).toBe(false);
  });

  it("uses the empty secret only for Bold sandbox webhooks", () => {
    process.env.BOLD_ENVIRONMENT = "test";
    process.env.BOLD_SECRET_KEY = "production-secret";
    expect(getBoldWebhookSecretKey()).toBe("");

    process.env.BOLD_ENVIRONMENT = "production";
    expect(getBoldWebhookSecretKey()).toBe("production-secret");
  });

  it("builds checkout payloads with a safe public redirection URL", () => {
    process.env.BOLD_SECRET_KEY = "secret";
    process.env.NEXT_PUBLIC_BOLD_IDENTITY_KEY = "identity-key";
    process.env.FRONTEND_STORE_URL = "http://localhost:3000";

    expect(
      generateBoldCheckoutData({
        id: "order-id",
        orderNumber: "ORD-123",
        total: 80000.49,
      }),
    ).toMatchObject({
      orderId: "order-id",
      orderNumber: "ORD-123",
      amount: 80000,
      currency: "COP",
      identityKey: "identity-key",
      redirectionUrl: "https://papeleriapdepapel.com/pedido/order-id",
      description: "Orden P de Papel ORD-123",
    });
  });

  it("uses the configured production mode and upgrades HTTP URLs", () => {
    process.env.BOLD_ENVIRONMENT = "production";
    process.env.BOLD_SECRET_KEY = "secret";
    process.env.FRONTEND_STORE_URL = "http://papeleriapdepapel.com";

    expect(getBoldConfig().isProd).toBe(true);
    expect(
      generateBoldCheckoutData({
        id: "order-id",
        total: 10000,
      }).redirectionUrl,
    ).toBe("https://papeleriapdepapel.com/pedido/order-id");
  });
});
