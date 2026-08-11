import { resolveProductGroupVariantStock } from "@/lib/product-group-variant-stock";
import { describe, expect, it } from "vitest";

describe("resolveProductGroupVariantStock", () => {
  it("never changes stock for an existing variant from a group-form save", () => {
    expect(
      resolveProductGroupVariantStock({
        isExistingVariant: true,
        submittedStock: 12,
      }),
    ).toEqual({
      initialMovementQuantity: null,
      productStock: undefined,
    });
  });

  it("creates new variants at zero before recording their initial intake", () => {
    expect(
      resolveProductGroupVariantStock({
        isExistingVariant: false,
        submittedStock: 12,
      }),
    ).toEqual({
      initialMovementQuantity: 12,
      productStock: 0,
    });
  });
});
