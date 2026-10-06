import {
  getDesignThumbnails,
  getStableProductVariants,
  getVariantMainImageUrl,
} from "@/lib/product-variants";
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

describe("getVariantMainImageUrl", () => {
  it("reads the trimmed sibling's image as is", () => {
    expect(getVariantMainImageUrl({ image: "https://x/a.jpg" })).toBe("https://x/a.jpg");
    expect(getVariantMainImageUrl({ image: null })).toBeNull();
  });

  it("takes the main photo of a full product, else its first one", () => {
    expect(
      getVariantMainImageUrl({ images: [{ url: "https://x/1.jpg", isMain: false }, { url: "https://x/2.jpg", isMain: true }] }),
    ).toBe("https://x/2.jpg");
    expect(getVariantMainImageUrl({ images: [{ url: "https://x/1.jpg", isMain: false }] })).toBe("https://x/1.jpg");
    expect(getVariantMainImageUrl({ images: [] })).toBeNull();
    expect(getVariantMainImageUrl({})).toBeNull();
  });
});

describe("getDesignThumbnails", () => {
  it("keeps one photo per design and drops the ones two designs share or that are missing", () => {
    const photos: Record<string, string | null> = { a: "https://x/a.jpg", b: "https://x/same.jpg", c: "https://x/same.jpg", d: null };
    const thumbnails = getDesignThumbnails(["a", "b", "c", "d"], (id) => photos[id]);
    expect(Object.fromEntries(thumbnails)).toEqual({ a: "https://x/a.jpg", b: null, c: null, d: null });
  });
});
