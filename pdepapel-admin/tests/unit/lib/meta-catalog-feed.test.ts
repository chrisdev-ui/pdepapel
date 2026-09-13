import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: { product: { findMany: vi.fn() } } }));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => {
      throw new Error("not configured");
    },
  },
}));

import { createGoogleMerchantFeedToken } from "@/lib/google-merchant-feed";
import {
  META_CATALOG_FEED_HEADERS,
  META_CATALOG_TITLE_MAX_LENGTH,
  buildMetaCatalogFeed,
  createMetaCatalogFeedToken,
  extractMetaCatalogFeedToken,
  getMetaCatalogFeedCacheKeys,
  getMetaCatalogFeedProductArgs,
  getMetaCatalogFeedUrl,
  isMetaCatalogFeedTokenValid,
  type MetaCatalogFeedProduct,
} from "@/lib/meta-catalog-feed";

function product(
  overrides: Partial<MetaCatalogFeedProduct> & { id: string },
): MetaCatalogFeedProduct {
  return {
    name: `Producto ${overrides.id}`,
    slug: `producto-${overrides.id}`,
    sku: `SKU-${overrides.id}`,
    description: "<p>Cuaderno <strong>A5</strong>, tapa dura</p>",
    price: 15000,
    stock: 3,
    brand: "P de Papel",
    gtin: null,
    mpn: null,
    hasNoProductIdentifier: false,
    isArchived: false,
    productGroupId: null,
    sizeId: null,
    colorId: null,
    designId: null,
    category: {
      id: "cat",
      name: "Cuadernos",
      type: { id: "type", name: "Papelería" },
    },
    color: null,
    design: null,
    size: null,
    productGroup: null,
    images: [
      { id: "img-1", url: "https://res.cloudinary.com/demo/image/upload/v1/a.webp", isMain: true },
      { id: "img-2", url: "https://res.cloudinary.com/demo/image/upload/v1/b.jpg", isMain: false },
    ],
    ...overrides,
  } as unknown as MetaCatalogFeedProduct;
}

function rowsOf(tsv: string) {
  const [header, ...rows] = tsv.trimEnd().split("\n");
  const keys = header.split("\t");
  return rows.map((row) =>
    Object.fromEntries(row.split("\t").map((cell, index) => [keys[index], cell])),
  );
}

describe("buildMetaCatalogFeed", () => {
  it("writes availability with a space, which is what Meta accepts", () => {
    const { tsv, report } = buildMetaCatalogFeed([
      product({ id: "1" }),
      product({ id: "2", stock: 0 }),
    ]);
    const [inStock, outOfStock] = rowsOf(tsv);

    expect(inStock.availability).toBe("in stock");
    expect(outOfStock.availability).toBe("out of stock");
    // El guion bajo del feed de Google rechaza el catálogo entero en Meta.
    expect(tsv).not.toContain("in_stock");
    expect(tsv).not.toContain("out_of_stock");
    expect(report.outOfStock).toBe(1);
  });

  it("writes the price as an amount with a decimal point and the ISO currency", () => {
    const [row] = rowsOf(buildMetaCatalogFeed([product({ id: "1" })]).tsv);
    expect(row.price).toBe("15000.00 COP");

    const [cents] = rowsOf(buildMetaCatalogFeed([product({ id: "1", price: 1250.5 })]).tsv);
    expect(cents.price).toBe("1250.50 COP");
  });

  it("marks identifier_exists as no without a GTIN or a brand and MPN pair", () => {
    const rows = rowsOf(
      buildMetaCatalogFeed([
        product({ id: "1" }),
        product({ id: "2", gtin: "7701234567890" }),
        product({ id: "3", brand: "P de Papel", mpn: "PDP-9" }),
        product({ id: "4", mpn: "PDP-9", brand: "" }),
        product({ id: "5", gtin: "7701234567890", hasNoProductIdentifier: true }),
      ]).tsv,
    );

    expect(rows.map((row) => row.identifier_exists)).toEqual(["no", "", "", "no", "no"]);
  });

  it("writes the agreed columns in order and keeps the row TSV-safe", () => {
    const { tsv, report } = buildMetaCatalogFeed(
      [
        product({
          id: "1",
          name: "Cuaderno\tA5\ncon  espacios",
          description: "<p>Línea uno<br>línea dos</p>",
        }),
      ],
      { generatedAt: new Date("2026-09-13T06:00:00.000Z") },
    );
    const [row] = rowsOf(tsv);

    expect(tsv.split("\n")[0]).toBe(META_CATALOG_FEED_HEADERS.join("\t"));
    expect(META_CATALOG_FEED_HEADERS).toEqual([
      "id",
      "title",
      "description",
      "availability",
      "condition",
      "price",
      "link",
      "image_link",
      "additional_image_link",
      "brand",
      "gtin",
      "mpn",
      "identifier_exists",
      "item_group_id",
      "product_type",
      "color",
      "size",
      "pattern",
    ]);
    expect(row).toMatchObject({
      id: "SKU-1",
      title: "Cuaderno A5 con espacios",
      description: "Línea uno línea dos",
      condition: "new",
      link: "https://papeleriapdepapel.com/producto/producto-1",
      // Meta solo acepta JPEG o PNG: la imagen WebP se sirve reescrita.
      image_link: "https://res.cloudinary.com/demo/image/upload/v1/a.png",
      additional_image_link: "https://res.cloudinary.com/demo/image/upload/v1/b.jpg",
      brand: "P de Papel",
      product_type: "Papelería > Cuadernos",
    });
    expect(report.generatedAt).toBe("2026-09-13T06:00:00.000Z");
  });

  it("leaves out the fields that only apply to native Facebook checkout", () => {
    const headers = META_CATALOG_FEED_HEADERS as readonly string[];
    for (const omitted of [
      "quantity_to_sell_on_facebook",
      "visibility",
      "status",
      "fb_product_category",
      "excluded_destination",
    ]) {
      expect(headers).not.toContain(omitted);
    }
  });

  it("cuts a title longer than what Meta accepts", () => {
    const [row] = rowsOf(
      buildMetaCatalogFeed([product({ id: "1", name: "Cuaderno ".repeat(40) })]).tsv,
    );
    expect(row.title.length).toBeLessThanOrEqual(META_CATALOG_TITLE_MAX_LENGTH);
    expect(row.title.startsWith("Cuaderno Cuaderno")).toBe(true);
  });

  it("groups variants with item_group_id unless the group repeats a combination", () => {
    const rows = rowsOf(
      buildMetaCatalogFeed([
        product({ id: "1", productGroupId: "group-a", sizeId: "s1" }),
        product({ id: "2", productGroupId: "group-a", sizeId: "s2" }),
        product({ id: "3", productGroupId: "group-b", sizeId: "s1" }),
        product({ id: "4", productGroupId: "group-b", sizeId: "s1" }),
      ]).tsv,
    );

    expect(rows.map((row) => row.item_group_id)).toEqual([
      "group-a",
      "group-a",
      "",
      "",
    ]);
  });

  it("falls back to the product id and reports a product with no images", () => {
    const { tsv, report } = buildMetaCatalogFeed([
      product({ id: "1", sku: "", images: [] }),
    ]);
    const [row] = rowsOf(tsv);

    expect(row.id).toBe("1");
    expect(row.image_link).toBe("");
    expect(report.missingImages).toEqual([
      { id: "1", productId: "1", name: "Producto 1" },
    ]);
  });

  it("exports only the verified links when a link map is given", () => {
    const { tsv, report } = buildMetaCatalogFeed(
      [product({ id: "1" }), product({ id: "2" })],
      { links: new Map([["1", "https://papeleriapdepapel.com/producto/verificado"]]) },
    );
    const rows = rowsOf(tsv);

    expect(rows).toHaveLength(1);
    expect(rows[0].link).toBe("https://papeleriapdepapel.com/producto/verificado");
    expect(report).toMatchObject({ activeProducts: 2, exportedProducts: 1 });
  });

  it("writes only the header when there is nothing to export", () => {
    const { tsv } = buildMetaCatalogFeed([]);
    expect(tsv).toBe(`${META_CATALOG_FEED_HEADERS.join("\t")}\n`);
  });
});

describe("Meta catalog feed eligibility", () => {
  it("selects the same products as the Google feed: not archived and available", () => {
    const args = getMetaCatalogFeedProductArgs("store-1");

    expect(args.where).toMatchObject({ storeId: "store-1", isArchived: false });
    expect(args.where).toHaveProperty("OR");
    expect(args.orderBy).toEqual({ name: "asc" });
  });
});

describe("Meta catalog feed access token", () => {
  const secret = "0123456789abcdef0123456789abcdef";

  it("binds the token to the store and never matches another one", () => {
    const token = createMetaCatalogFeedToken("store-1", secret);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(isMetaCatalogFeedTokenValid("store-1", token, secret)).toBe(true);
    expect(isMetaCatalogFeedTokenValid("store-2", token, secret)).toBe(false);
    expect(isMetaCatalogFeedTokenValid("store-1", token, "otro-secreto")).toBe(false);
    expect(isMetaCatalogFeedTokenValid("store-1", "", secret)).toBe(false);
    expect(isMetaCatalogFeedTokenValid("store-1", token, undefined)).toBe(false);
  });

  it("does not accept the Google feed token even with the same secret", () => {
    const googleToken = createGoogleMerchantFeedToken("store-1", secret);

    expect(createMetaCatalogFeedToken("store-1", secret)).not.toBe(googleToken);
    expect(isMetaCatalogFeedTokenValid("store-1", googleToken, secret)).toBe(false);
  });

  it("reads the token from the query string, a bearer header or basic auth", () => {
    const url = "https://admin.example.com/api/store-1/meta-catalog/feed";

    expect(extractMetaCatalogFeedToken(new Request(`${url}?token=abc`))).toBe("abc");
    expect(
      extractMetaCatalogFeedToken(
        new Request(url, { headers: { authorization: "Bearer abc" } }),
      ),
    ).toBe("abc");
    expect(
      extractMetaCatalogFeedToken(
        new Request(url, {
          headers: {
            authorization: `Basic ${Buffer.from("meta:abc").toString("base64")}`,
          },
        }),
      ),
    ).toBe("abc");
    expect(extractMetaCatalogFeedToken(new Request(url))).toBeNull();
  });

  it("builds the hosted URL that Commerce Manager downloads", () => {
    expect(
      getMetaCatalogFeedUrl("store-1", secret, "https://admin.papeleriapdepapel.com"),
    ).toBe(
      `https://admin.papeleriapdepapel.com/api/store-1/meta-catalog/feed?token=${createMetaCatalogFeedToken("store-1", secret)}`,
    );
  });
});

describe("Meta catalog feed cache keys", () => {
  it("keeps its own keys, separate from the Google feed", () => {
    expect(getMetaCatalogFeedCacheKeys("store-1")).toEqual({
      feed: "store:store-1:meta-catalog:feed",
      report: "store:store-1:meta-catalog:report",
    });
  });
});
