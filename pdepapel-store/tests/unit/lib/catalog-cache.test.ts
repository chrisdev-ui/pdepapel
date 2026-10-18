import { describe, expect, it } from "vitest";

import { catalogListingTags, productTag } from "@/lib/catalog-cache";

describe("catalog cache tags", () => {
  it("scopes listings by group, category and type so a product change does not purge other categories", () => {
    expect(catalogListingTags({ productGroupId: "g-1" })).toEqual(["products", "products:group:g-1"]);
    expect(catalogListingTags({ categoryId: "cat-1", fromShop: true })).toEqual(["products", "products:category:cat-1"]);
    expect(catalogListingTags({ typeId: "type-1", categoryId: "cat-1" })).toEqual(["products", "products:category:cat-1", "products:type:type-1"]);
  });

  it("gives featured listings their own tag, so the header is purged only when featured data changes", () => {
    expect(catalogListingTags({ isFeatured: true, limit: 60 })).toEqual(["products", "products:featured"]);
  });

  it("puts every other listing on the general list tag", () => {
    expect(catalogListingTags({ fromShop: true, page: 1, itemsPerPage: 24, groupBy: "parents" })).toEqual(["products", "products:list"]);
    expect(catalogListingTags({ onlyNew: true, limit: 8 })).toEqual(["products", "products:list"]);
    expect(catalogListingTags({ isFeatured: false })).toEqual(["products", "products:list"]);
  });

  it("keeps brand listings on the general list tag, which a brand assignment purges", () => {
    expect(catalogListingTags({ marca: "kiut", fromShop: true })).toEqual(["products", "products:list"]);
    expect(catalogListingTags({ marca: "kiut", categoryId: "cat-1" })).toEqual(["products", "products:category:cat-1", "products:list"]);
  });

  it("names a product by the key the page asked for (slug or alias)", () => {
    expect(productTag("cuaderno-rosa")).toBe("product:cuaderno-rosa");
  });
});
