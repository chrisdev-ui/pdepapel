import { getStableProductVariants } from "@/lib/product-variants";
import { Product, ProductVariant } from "@/types";
import { describe, expect, it } from "vitest";

const product = (id: string, slug: string) => ({ id, slug }) as Product;
const variant = (id: string, slug: string) => ({
  id,
  slug,
}) as ProductVariant;

describe("getStableProductVariants", () => {
  it("preserves the catalog order when the selected variant is already present", () => {
    const selectedProduct = product("yellow", "cuaderno-amarillo");
    const siblings = [
      variant("blue", "cuaderno-azul"),
      variant("pink", "cuaderno-rosado"),
      variant("yellow", "cuaderno-amarillo"),
      variant("purple", "cuaderno-morado"),
    ];

    expect(getStableProductVariants(selectedProduct, siblings).map(({ id }) => id)).toEqual([
      "blue",
      "pink",
      "yellow",
      "purple",
    ]);
  });

  it("adds the current product only when the sibling payload does not contain it", () => {
    const selectedProduct = product("yellow", "cuaderno-amarillo");
    const siblings = [
      variant("blue", "cuaderno-azul"),
      variant("pink", "cuaderno-rosado"),
    ];

    expect(getStableProductVariants(selectedProduct, siblings).map(({ id }) => id)).toEqual([
      "blue",
      "pink",
      "yellow",
    ]);
  });
});
