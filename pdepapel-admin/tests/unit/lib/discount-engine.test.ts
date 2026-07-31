import {
  calculateDiscountedPrice,
  getActiveOffers,
  getProductsPrices,
} from "@/lib/discount-engine";
import { DiscountType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveOffers: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    offer: { findMany: mocks.findActiveOffers },
  },
}));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({ get: mocks.redisGet, set: mocks.redisSet }),
  },
}));
vi.mock("@/lib/date-utils", () => ({ getColombiaDate: vi.fn() }));

const directOffer = {
  id: "direct-offer",
  name: "Descuento directo",
  label: "10% OFF",
  type: DiscountType.PERCENTAGE,
  amount: 10,
  products: [{ productId: "product-id" }],
  categories: [],
  productGroups: [],
};

describe("discount engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses cached active offers before querying the database", async () => {
    mocks.redisGet.mockResolvedValue([directOffer]);

    await expect(getActiveOffers("store-id")).resolves.toEqual([directOffer]);
    expect(mocks.findActiveOffers).not.toHaveBeenCalled();
  });

  it("falls back to the database and refreshes cache when Redis is unavailable", async () => {
    mocks.redisGet.mockRejectedValue(new Error("Redis unavailable"));
    mocks.findActiveOffers.mockResolvedValue([directOffer]);

    await expect(getActiveOffers("store-id")).resolves.toEqual([directOffer]);
    expect(mocks.findActiveOffers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-id", isActive: true }),
      }),
    );
    expect(mocks.redisSet).toHaveBeenCalledWith(
      "store:store-id:active-offers",
      [directOffer],
      { ex: 3600 },
    );
  });

  it("selects the best applicable offer across product, category, and group", async () => {
    mocks.redisGet.mockResolvedValue([
      directOffer,
      {
        id: "category-offer",
        name: "Descuento categoría",
        label: null,
        type: DiscountType.FIXED,
        amount: 3000,
        products: [],
        categories: [{ categoryId: "category-id" }],
        productGroups: [],
      },
      {
        id: "group-offer",
        name: "Descuento grupo",
        label: "40% OFF",
        type: DiscountType.PERCENTAGE,
        amount: 40,
        products: [],
        categories: [],
        productGroups: [{ productGroupId: "group-id" }],
      },
    ]);

    await expect(
      calculateDiscountedPrice(
        {
          id: "product-id",
          categoryId: "category-id",
          productGroupId: "group-id",
          price: 10000,
        },
        "store-id",
      ),
    ).resolves.toEqual({
      price: 6000,
      originalPrice: 10000,
      discount: 4000,
      offerLabel: "40% OFF",
      matchedOfferId: "group-offer",
    });
  });

  it("returns original prices for products without a matching active offer", async () => {
    mocks.redisGet.mockResolvedValue([directOffer]);

    const prices = await getProductsPrices(
      [
        {
          id: "product-id",
          categoryId: "category-id",
          productGroupId: null,
          price: 10000,
        },
        {
          id: "other-product",
          categoryId: "other-category",
          productGroupId: null,
          price: 5000,
        },
      ],
      "store-id",
    );

    expect(prices.get("product-id")).toMatchObject({
      price: 9000,
      discount: 1000,
    });
    expect(prices.get("other-product")).toMatchObject({
      price: 5000,
      discount: 0,
    });
  });
});
