import { getVariantSlugAttributeInclusion } from "@/lib/product-slugs";
import { describe, expect, it } from "vitest";

describe("variant slug attributes", () => {
  it("keeps shared operational attributes out of variant URLs", () => {
    const inclusion = getVariantSlugAttributeInclusion([
      {
        color: { name: "Amarillo pastel" },
        design: { name: "Kawaii" },
        size: { name: "S+", value: "S-P" },
      },
      {
        color: { name: "Azul pastel" },
        design: { name: "Kawaii" },
        size: { name: "S+", value: "S-P" },
      },
    ]);

    expect(inclusion).toEqual({
      color: true,
      design: false,
      size: false,
    });
  });

  it("includes an attribute when it is the only customer-visible difference", () => {
    const inclusion = getVariantSlugAttributeInclusion([
      {
        color: { name: "Sin Color" },
        design: { name: "Hello Kitty" },
        size: { name: "A5", value: "A5" },
      },
      {
        color: { name: "Sin Color" },
        design: { name: "Kuromi" },
        size: { name: "A5", value: "A5" },
      },
    ]);

    expect(inclusion).toEqual({
      color: false,
      design: true,
      size: false,
    });
  });
});
