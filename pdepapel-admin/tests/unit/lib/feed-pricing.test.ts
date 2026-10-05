import { DiscountType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveOffers: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: { offer: { findMany: mocks.findActiveOffers }, product: { findMany: vi.fn() } },
}));
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ get: mocks.redisGet, set: mocks.redisSet }) },
}));
vi.mock("@/lib/date-utils", () => ({ getColombiaDate: vi.fn() }));

import { calculateDiscountedPrice } from "@/lib/discount-engine";
import { getFeedPricing, getFeedPricingMap } from "@/lib/feed-pricing";
import { buildGoogleMerchantFeed, type GoogleMerchantFeedProduct } from "@/lib/google-merchant-feed";
import { buildMetaCatalogFeed, type MetaCatalogFeedProduct } from "@/lib/meta-catalog-feed";

const STORE = "store-1";

function product(id: string, price: number, categoryId = "cat-cuadernos") {
  return {
    id,
    storeId: STORE,
    name: `Cuaderno ${id}`,
    slug: `cuaderno-${id}`,
    sku: `SKU-${id}`,
    description: "<p>Cuaderno argollado</p>",
    price,
    stock: 4,
    brand: "Norma",
    gtin: null,
    mpn: null,
    hasNoProductIdentifier: true,
    isArchived: false,
    categoryId,
    productGroupId: null,
    sizeId: null,
    colorId: null,
    designId: null,
    category: { id: categoryId, name: "Cuadernos", type: { id: "type", name: "Papelería" } },
    color: null,
    design: null,
    size: null,
    productGroup: null,
    images: [{ id: `img-${id}`, url: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg", isMain: true }],
  } as unknown as GoogleMerchantFeedProduct & MetaCatalogFeedProduct;
}

const offer = {
  id: "offer-escolar",
  label: "Regreso a clases",
  type: DiscountType.PERCENTAGE,
  amount: 15,
  startDate: new Date("2026-10-06T05:00:00.000Z"),
  endDate: new Date("2026-10-13T04:59:59.999Z"),
  products: [{ productId: "en-oferta" }],
  categories: [],
  productGroups: [],
};

function rowsOf(tsv: string) {
  const [header, ...rows] = tsv.trimEnd().split("\n");
  const keys = header.split("\t");
  return rows.map((row) =>
    Object.fromEntries(row.split("\t").map((cell, index) => [keys[index], cell])),
  );
}

const amount = (cell: string) => (cell ? Number(cell.replace(" COP", "")) : null);

describe("getFeedPricing", () => {
  it("announces only the base price when there is no offer", () => {
    expect(getFeedPricing({ id: "a", price: 18000 })).toEqual({ price: 18000, salePrice: null, salePriceEffectiveDate: null });
    expect(getFeedPricing({ id: "a", price: 18000 }, { price: 18000, discount: 0 })).toEqual({ price: 18000, salePrice: null, salePriceEffectiveDate: null });
  });

  it("adds the sale price and the offer window in ISO 8601", () => {
    expect(getFeedPricing({ id: "a", price: 20000 }, { price: 17000, discount: 3000, offer })).toEqual({
      price: 20000,
      salePrice: 17000,
      salePriceEffectiveDate: "2026-10-06T05:00:00.000Z/2026-10-13T04:59:59.999Z",
    });
  });
});

/**
 * La ficha publica en el JSON-LD `offers.price` = el `price` que devuelve la
 * API de la tienda, que es `calculateDiscountedPrice(...).price`. Los feeds
 * tienen que anunciar ese mismo número o Merchant marca «precio no coincide».
 */
describe("feeds and the storefront price agree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisGet.mockResolvedValue(null);
    mocks.findActiveOffers.mockResolvedValue([offer]);
  });

  const products = [product("en-oferta", 20000), product("sin-oferta", 18000)];

  it.each([
    ["Google Merchant", (pricing: Awaited<ReturnType<typeof getFeedPricingMap>>) => buildGoogleMerchantFeed(products, { pricing }).tsv],
    ["Meta", (pricing: Awaited<ReturnType<typeof getFeedPricingMap>>) => buildMetaCatalogFeed(products, { pricing }).tsv],
  ])("%s: the effective feed price equals the storefront JSON-LD price", async (_name, build) => {
    const pricing = await getFeedPricingMap(STORE, products);
    const rows = rowsOf(build(pricing));

    for (const item of products) {
      const storefront = await calculateDiscountedPrice(item, STORE);
      const row = rows.find((candidate) => candidate.id === item.sku)!;
      const effective = amount(row.sale_price) ?? amount(row.price);

      expect(effective).toBe(storefront.price);
      expect(amount(row.price)).toBe(item.price);
    }

    const discounted = rows.find((row) => row.id === "SKU-en-oferta")!;
    expect(amount(discounted.sale_price)).toBe(17000);
    expect(discounted.sale_price_effective_date).toBe("2026-10-06T05:00:00.000Z/2026-10-13T04:59:59.999Z");

    const regular = rows.find((row) => row.id === "SKU-sin-oferta")!;
    expect(regular.sale_price).toBe("");
    expect(regular.sale_price_effective_date).toBe("");
  });

  it("matches the storefront when the offer comes through the category", async () => {
    mocks.findActiveOffers.mockResolvedValue([
      { ...offer, products: [], categories: [{ categoryId: "cat-cuadernos" }], type: DiscountType.FIXED, amount: 2500 },
    ]);
    const item = product("por-categoria", 18000);
    const pricing = await getFeedPricingMap(STORE, [item]);
    const [row] = rowsOf(buildGoogleMerchantFeed([item], { pricing }).tsv);

    expect(amount(row.sale_price)).toBe((await calculateDiscountedPrice(item, STORE)).price);
    expect(amount(row.sale_price)).toBe(15500);
  });
});
