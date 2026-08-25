import { describe, expect, it } from "vitest";

import { buildProductSlugRedirects } from "@/lib/product-slug-redirects";

describe("buildProductSlugRedirects", () => {
  it("exports safe aliases that do not collide with current product URLs", () => {
    expect(
      buildProductSlugRedirects(
        [
          {
            slug: "sello-lacre-amarillo-pastel-kawaii-s",
            product: { slug: "sello-lacre-amarillo-pastel" },
          },
          {
            slug: "another-product",
            product: { slug: "another-product" },
          },
          {
            slug: "current-product",
            product: { slug: "renamed-product" },
          },
          {
            slug: "unsafe_slug",
            product: { slug: "safe-product" },
          },
        ],
        ["current-product", "sello-lacre-amarillo-pastel"],
      ),
    ).toEqual([
      {
        source: "/producto/sello-lacre-amarillo-pastel-kawaii-s",
        destination: "/producto/sello-lacre-amarillo-pastel",
      },
    ]);
  });
});
