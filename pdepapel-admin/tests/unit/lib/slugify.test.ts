import { generateProductSlug, slugify } from "@/lib/slugify";
import { describe, expect, it } from "vitest";

describe("product slugs", () => {
  it("normalizes customer-facing names into stable URL segments", () => {
    expect(slugify("  Cápsula: Kawaii & Co.  ")).toBe("capsula-kawaii-co");
  });

  it("does not duplicate attributes already included in the product name", () => {
    expect(
      generateProductSlug({
        name: "Cajita sorpresa Snoopy",
        design: { name: "Snoopy" },
        color: { name: "Multicolor" },
        size: { name: "L" },
        includeVariantAttributes: true,
      }),
    ).toBe("cajita-sorpresa-snoopy-multicolor-l");
  });

  it("omits placeholder variant attributes", () => {
    expect(
      generateProductSlug({
        name: "Agenda floral",
        design: { name: "Sin Diseño" },
        color: { name: "Sin Color" },
        size: { name: "Única" },
        includeVariantAttributes: true,
      }),
    ).toBe("agenda-floral");
  });

  it("omits internal logistics sizes from customer-facing URLs", () => {
    expect(
      generateProductSlug({
        name: "Sello lacre amarillo pastel",
        design: { name: "Kawaii" },
        color: { name: "Amarillo pastel" },
        size: { name: "S+", value: "S-P" },
        includeVariantAttributes: true,
      }),
    ).toBe("sello-lacre-amarillo-pastel-kawaii");
  });

  it("only includes variant attributes that differentiate a product", () => {
    expect(
      generateProductSlug({
        name: "Sello lacre amarillo pastel",
        design: { name: "Kawaii" },
        color: { name: "Amarillo pastel" },
        size: { name: "S+", value: "S-P" },
        includeVariantAttributes: true,
        variantAttributes: {
          color: true,
          design: false,
          size: false,
        },
      }),
    ).toBe("sello-lacre-amarillo-pastel");
  });
});
