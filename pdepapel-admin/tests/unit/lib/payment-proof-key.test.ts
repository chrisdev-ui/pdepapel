import { describe, expect, it } from "vitest";

import {
  buildPaymentProofKey,
  isPaymentProofForStore,
  isPaymentProofMimeType,
  parsePaymentProofKey,
  paymentProofContentType,
  paymentProofExtension,
  PAYMENT_PROOF_MAX_BYTES,
} from "@/lib/payment-proof-key";

const id = "0f3a9c1e-7b2d-4c8e-9a1f-2b3c4d5e6f70";
const canonical = `comprobantes/store-1/${id}.jpg`;

describe("payment proof keys", () => {
  it("builds and parses the canonical object key", () => {
    expect(buildPaymentProofKey({ storeId: "store-1", id, format: "jpg" })).toBe(canonical);
    expect(parsePaymentProofKey(canonical)).toEqual({ storeId: "store-1", id, format: "jpg" });
  });

  it("ties the proof to its store", () => {
    expect(isPaymentProofForStore(canonical, "store-1")).toBe(true);
    expect(isPaymentProofForStore(canonical, "store-2")).toBe(false);
  });

  it.each([
    ["another folder", `productos/store-1/${id}.jpg`],
    ["a non-uuid name", "comprobantes/store-1/captura.jpg"],
    ["a PDF", `comprobantes/store-1/${id}.pdf`],
    ["an SVG", `comprobantes/store-1/${id}.svg`],
    ["a traversal attempt", `comprobantes/store-1/../store-2/${id}.jpg`],
    ["a leading slash", `/${canonical}`],
    ["a full URL", `https://bucket.example/${canonical}`],
    ["uppercase uuid", `comprobantes/store-1/${id.toUpperCase()}.jpg`],
    ["garbage", "not a key"],
  ])("rejects %s", (_label, key) => {
    expect(parsePaymentProofKey(key)).toBeNull();
    expect(isPaymentProofForStore(key, "store-1")).toBe(false);
  });

  it("refuses unsafe segments when building", () => {
    expect(() => buildPaymentProofKey({ storeId: "../x", id, format: "jpg" })).toThrow();
    expect(() => buildPaymentProofKey({ storeId: "store-1", id: "captura", format: "jpg" })).toThrow();
  });

  it("accepts only image mime types, maps them to extensions, and caps the size under Vercel's body limit", () => {
    expect(isPaymentProofMimeType("image/jpeg")).toBe(true);
    expect(isPaymentProofMimeType("image/png")).toBe(true);
    expect(isPaymentProofMimeType("image/webp")).toBe(true);
    expect(isPaymentProofMimeType("application/pdf")).toBe(false);
    expect(isPaymentProofMimeType("image/svg+xml")).toBe(false);
    expect(paymentProofExtension("image/jpeg")).toBe("jpg");
    expect(paymentProofExtension("image/webp")).toBe("webp");
    expect(paymentProofContentType("jpg")).toBe("image/jpeg");
    expect(paymentProofContentType("png")).toBe("image/png");
    expect(PAYMENT_PROOF_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});
