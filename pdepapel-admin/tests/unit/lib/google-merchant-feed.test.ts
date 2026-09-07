import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: { product: { findMany: vi.fn() } } }));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => {
      throw new Error("not configured");
    },
  },
}));

import {
  GOOGLE_MERCHANT_FEED_HEADERS,
  buildGoogleMerchantFeed,
  createGoogleMerchantFeedToken,
  extractGoogleMerchantFeedToken,
  getGoogleMerchantFeedCacheKeys,
  getGoogleMerchantFeedProductArgs,
  getGoogleMerchantFeedUrl,
  isGoogleMerchantFeedTokenValid,
  type GoogleMerchantFeedProduct,
} from "@/lib/google-merchant-feed";

function product(
  overrides: Partial<GoogleMerchantFeedProduct> & { id: string },
): GoogleMerchantFeedProduct {
  return {
    name: `Producto ${overrides.id}`,
    slug: `producto-${overrides.id}`,
    sku: `SKU-${overrides.id}`,
    description: "<p>Cuaderno <strong>A5</strong>, tapa dura</p>",
    price: 18000,
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
  } as unknown as GoogleMerchantFeedProduct;
}

function rowsOf(tsv: string) {
  const [header, ...rows] = tsv.trimEnd().split("\n");
  const keys = header.split("\t");
  return rows.map((row) =>
    Object.fromEntries(row.split("\t").map((cell, index) => [keys[index], cell])),
  );
}

describe("buildGoogleMerchantFeed", () => {
  it("writes the Merchant Center columns with catalog-safe values", () => {
    const { tsv, report } = buildGoogleMerchantFeed(
      [product({ id: "1" }), product({ id: "2", stock: 0, sku: "" })],
      { generatedAt: new Date("2026-09-07T06:00:00.000Z") },
    );
    const [first, second] = rowsOf(tsv);

    expect(tsv.split("\n")[0]).toBe(GOOGLE_MERCHANT_FEED_HEADERS.join("\t"));
    expect(first).toMatchObject({
      id: "SKU-1",
      title: "Producto 1",
      description: "Cuaderno A5, tapa dura",
      link: "https://papeleriapdepapel.com/producto/producto-1",
      image_link: "https://res.cloudinary.com/demo/image/upload/v1/a.png",
      additional_image_link: "https://res.cloudinary.com/demo/image/upload/v1/b.jpg",
      price: "18000 COP",
      condition: "new",
      availability: "in_stock",
      brand: "P de Papel",
      identifier_exists: "no",
      product_type: "Papelería > Cuadernos",
      excluded_destination: "Local_inventory_ads,Free_local_listings",
    });
    expect(second.id).toBe("2");
    expect(second.availability).toBe("out_of_stock");
    expect(report).toMatchObject({
      generatedAt: "2026-09-07T06:00:00.000Z",
      activeProducts: 2,
      exportedProducts: 2,
      outOfStock: 1,
      withoutIdentifier: 2,
      missingImages: [],
      groupsWithDuplicateVariants: [],
    });
    expect(report.rewrittenImages).toEqual([
      {
        id: "SKU-1",
        from: "https://res.cloudinary.com/demo/image/upload/v1/a.webp",
        to: "https://res.cloudinary.com/demo/image/upload/v1/a.png",
      },
      {
        id: "2",
        from: "https://res.cloudinary.com/demo/image/upload/v1/a.webp",
        to: "https://res.cloudinary.com/demo/image/upload/v1/a.png",
      },
    ]);
  });

  it("keeps real identifiers and drops item_group_id for groups with duplicate variants", () => {
    const { tsv, report } = buildGoogleMerchantFeed([
      product({ id: "g1", productGroupId: "group", colorId: "red", gtin: "7701234567890" }),
      product({ id: "g2", productGroupId: "group", colorId: "red", mpn: "MPN-2" }),
      product({ id: "ok", productGroupId: "other", colorId: "blue" }),
    ]);
    const [g1, g2, ok] = rowsOf(tsv);

    expect(g1.gtin).toBe("7701234567890");
    expect(g1.identifier_exists).toBe("");
    expect(g2.mpn).toBe("MPN-2");
    expect(g2.identifier_exists).toBe("");
    expect(g1.item_group_id).toBe("");
    expect(g2.item_group_id).toBe("");
    expect(ok.item_group_id).toBe("other");
    expect(report.groupsWithDuplicateVariants).toEqual(["group"]);
    expect(report.withoutIdentifier).toBe(1);
  });

  it("reports products without images and never breaks the row layout", () => {
    const { tsv, report } = buildGoogleMerchantFeed([
      product({ id: "x", images: [], name: "Con\ttab y\nsalto", description: "" }),
    ]);
    const [row] = rowsOf(tsv);

    expect(row.title).toBe("Con tab y salto");
    expect(row.description).toBe("Con tab y salto");
    expect(row.image_link).toBe("");
    expect(report.missingImages).toEqual([
      { id: "SKU-x", productId: "x", name: "Con\ttab y\nsalto" },
    ]);
    expect(tsv.split("\n")[1].split("\t")).toHaveLength(
      GOOGLE_MERCHANT_FEED_HEADERS.length,
    );
  });

  it("uses verified links and excludes products the exporter left out", () => {
    const links = new Map([["1", "https://papeleriapdepapel.com/producto/nuevo-slug"]]);
    const { tsv, report } = buildGoogleMerchantFeed(
      [product({ id: "1" }), product({ id: "2" })],
      { links },
    );

    expect(rowsOf(tsv)).toHaveLength(1);
    expect(rowsOf(tsv)[0].link).toBe("https://papeleriapdepapel.com/producto/nuevo-slug");
    expect(report).toMatchObject({ activeProducts: 2, exportedProducts: 1 });
  });

  it("returns only the header when the store has no active products", () => {
    const { tsv, report } = buildGoogleMerchantFeed([]);

    expect(tsv).toBe(`${GOOGLE_MERCHANT_FEED_HEADERS.join("\t")}\n`);
    expect(report.exportedProducts).toBe(0);
  });

  it("scopes the catalog query to the store and to non-archived products", () => {
    expect(getGoogleMerchantFeedProductArgs("store-1")).toMatchObject({
      where: { storeId: "store-1", isArchived: false },
      orderBy: { name: "asc" },
    });
  });
});

describe("Google Merchant feed access token", () => {
  const secret = "0123456789abcdef0123456789abcdef";

  it("is store-bound, deterministic and rejects other stores or secrets", () => {
    const token = createGoogleMerchantFeedToken("store-1", secret);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(createGoogleMerchantFeedToken("store-1", secret)).toBe(token);
    expect(isGoogleMerchantFeedTokenValid("store-1", token, secret)).toBe(true);
    expect(isGoogleMerchantFeedTokenValid("store-2", token, secret)).toBe(false);
    expect(isGoogleMerchantFeedTokenValid("store-1", token, "another-secret-value")).toBe(false);
    expect(isGoogleMerchantFeedTokenValid("store-1", token.slice(0, -1), secret)).toBe(false);
    expect(isGoogleMerchantFeedTokenValid("store-1", null, secret)).toBe(false);
    expect(isGoogleMerchantFeedTokenValid("store-1", token, undefined)).toBe(false);
  });

  it("reads the token from the query string, a bearer header or basic auth", () => {
    const token = createGoogleMerchantFeedToken("store-1", secret);
    const base = "https://admin.example.com/api/store-1/google-merchant/feed";

    expect(extractGoogleMerchantFeedToken(new Request(`${base}?token=${token}`))).toBe(token);
    expect(
      extractGoogleMerchantFeedToken(
        new Request(base, { headers: { authorization: `Bearer ${token}` } }),
      ),
    ).toBe(token);
    expect(
      extractGoogleMerchantFeedToken(
        new Request(base, {
          headers: {
            authorization: `Basic ${Buffer.from(`merchant:${token}`).toString("base64")}`,
          },
        }),
      ),
    ).toBe(token);
    expect(extractGoogleMerchantFeedToken(new Request(base))).toBeNull();
  });

  it("builds the hosted URL under the admin domain", () => {
    const url = new URL(
      getGoogleMerchantFeedUrl("store-1", secret, "https://admin.papeleriapdepapel.com"),
    );

    expect(url.origin).toBe("https://admin.papeleriapdepapel.com");
    expect(url.pathname).toBe("/api/store-1/google-merchant/feed");
    expect(url.searchParams.get("token")).toBe(
      createGoogleMerchantFeedToken("store-1", secret),
    );
    expect(getGoogleMerchantFeedCacheKeys("store-1")).toEqual({
      feed: "store:store-1:google-merchant:feed",
      report: "store:store-1:google-merchant:report",
    });
  });
});
