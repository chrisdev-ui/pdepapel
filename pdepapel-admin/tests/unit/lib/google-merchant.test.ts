import {
  getGoogleMerchantColor,
  getGoogleMerchantPattern,
  getGoogleMerchantSize,
} from "@/lib/google-merchant";
import { describe, expect, it } from "vitest";

describe("Google Merchant product attributes", () => {
  it("does not export internal logistics codes as a product size", () => {
    expect(
      getGoogleMerchantSize("Manualidades", { name: "M+", value: "M-P" }),
    ).toBe("");
  });

  it("exports a real customer-facing measurement using the display name", () => {
    expect(
      getGoogleMerchantSize("Cuadernos", { name: "A5", value: "A5" }),
    ).toBe("A5");
  });

  it("uses the human-readable letter size for a category where size matters", () => {
    expect(getGoogleMerchantSize("Ropa", { name: "M", value: "M-P" })).toBe(
      "M",
    );
  });

  it("omits operational color and design values that the public title does not confirm", () => {
    const title = "Troqueles de figuras en maletín x8 de 1 cm";

    expect(getGoogleMerchantColor(title, { name: "Pastel" })).toBe("");
    expect(getGoogleMerchantPattern(title, { name: "Clásico" })).toBe("");
  });

  it("exports color and design when the public title confirms them", () => {
    const title = "Agenda Hello Kitty rosa";

    expect(getGoogleMerchantColor(title, { name: "Rosa" })).toBe("Rosa");
    expect(getGoogleMerchantPattern(title, { name: "Hello Kitty" })).toBe(
      "Hello Kitty",
    );
  });
});
