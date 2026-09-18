import { describe, expect, it } from "vitest";

import { productCacheKeyPatterns } from "@/lib/cache";

/** Archivar un producto lo dejaba una hora en el buscador de la tienda: solo se purgaba `products:*`. */
describe("productCacheKeyPatterns", () => {
  it("covers the storefront search, the search vocabulary and the panel selector", () => {
    expect(productCacheKeyPatterns("s1")).toEqual([
      "store:s1:products:*",
      "store:s1:search:*",
      "store:s1:search-vocabulary:*",
      "store:s1:admin-select:*",
    ]);
  });
});
