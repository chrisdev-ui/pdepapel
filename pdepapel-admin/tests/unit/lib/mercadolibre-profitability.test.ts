import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOrders: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceOrder: { findMany: mocks.findOrders },
  },
}));

import { getMercadoLibreListingProfitability } from "@/lib/mercadolibre/profitability";
import { getMarketplaceItemAcquisitionCost } from "@/lib/mercadolibre/reporting";

const paidAt = new Date("2026-08-19T13:30:00.000Z");

describe("Mercado Libre acquisition cost", () => {
  it("prefers the cost captured when the sale was synchronized", () => {
    expect(
      getMarketplaceItemAcquisitionCost({
        quantity: 1,
        unitPrice: 54_440,
        acqPrice: 30_000,
        product: { acqPrice: 34_000 },
      }),
    ).toBe(30_000);
  });

  it("falls back to the linked product when there is no snapshot yet", () => {
    expect(
      getMarketplaceItemAcquisitionCost({
        quantity: 1,
        unitPrice: 46_457,
        acqPrice: null,
        listing: { product: { acqPrice: 34_000 } },
        product: { acqPrice: 34_000 },
      }),
    ).toBe(34_000);
  });

  it("reports an unlinked sale as unknown cost instead of zero", () => {
    expect(
      getMarketplaceItemAcquisitionCost({
        quantity: 1,
        unitPrice: 54_440,
        acqPrice: null,
        listing: null,
        product: null,
      }),
    ).toBeNull();
  });

  it("treats a product without registered cost as unknown, not free", () => {
    expect(
      getMarketplaceItemAcquisitionCost({
        quantity: 1,
        unitPrice: 54_440,
        acqPrice: null,
        product: { acqPrice: 0 },
      }),
    ).toBeNull();
    expect(
      getMarketplaceItemAcquisitionCost({
        quantity: 1,
        unitPrice: 54_440,
        acqPrice: null,
        product: { acqPrice: null },
      }),
    ).toBeNull();
  });
});

describe("Mercado Libre listing profitability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never reports an unlinked sale as 100% profit", async () => {
    mocks.findOrders.mockResolvedValue([
      {
        // Sale that arrived before its publication was linked: both links are null.
        externalOrderId: "2000018023721850",
        paidAt,
        createdAt: paidAt,
        netAmount: 54_440,
        items: [
          {
            listingId: null,
            productId: null,
            acqPrice: null,
            title: "Termo Tipo Owala Freesip 710ml Acero Inoxidable Rojo",
            quantity: 1,
            unitPrice: 54_440,
            listing: null,
            product: null,
          },
        ],
      },
      {
        externalOrderId: "2000017813937484",
        paidAt,
        createdAt: paidAt,
        netAmount: 46_457,
        items: [
          {
            listingId: "listing-1",
            productId: "product-1",
            acqPrice: 34_000,
            title: "Estuche Marcadores Graficolors Brush Punta Pincel",
            quantity: 1,
            unitPrice: 46_457,
            listing: {
              title: "Estuche Marcadores Graficolors Brush Punta Pincel",
              product: {
                name: "Marcadores acrílicos punta pincel x60",
                acqPrice: 34_000,
              },
            },
            product: {
              name: "Marcadores acrílicos punta pincel x60",
              acqPrice: 34_000,
            },
          },
        ],
      },
    ]);

    const [linked, unlinked] =
      await getMercadoLibreListingProfitability("connection-id");

    expect(linked).toMatchObject({
      listingId: "listing-1",
      productName: "Marcadores acrílicos punta pincel x60",
      netCollected: 46_457,
      productCost: 34_000,
      netProfit: 12_457,
      costStatus: "AVAILABLE",
      pendingOrderIds: [],
    });
    expect(linked.marginPercentage).toBeCloseTo(26.81, 1);

    expect(unlinked).toMatchObject({
      listingId: null,
      productName: null,
      netCollected: 54_440,
      productCost: null,
      netProfit: null,
      marginPercentage: null,
      costStatus: "UNLINKED_PRODUCT",
      pendingOrderIds: ["2000018023721850"],
    });
  });

  it("flags a linked product that has no acquisition cost registered", async () => {
    mocks.findOrders.mockResolvedValue([
      {
        externalOrderId: "2000017890359944",
        paidAt,
        createdAt: paidAt,
        netAmount: 20_000,
        items: [
          {
            listingId: "listing-2",
            productId: "product-2",
            acqPrice: null,
            title: "Sticker kawaii",
            quantity: 2,
            unitPrice: 10_000,
            listing: {
              title: "Sticker kawaii",
              product: { name: "Sticker kawaii", acqPrice: 0 },
            },
            product: { name: "Sticker kawaii", acqPrice: 0 },
          },
        ],
      },
    ]);

    const [row] = await getMercadoLibreListingProfitability("connection-id");

    expect(row).toMatchObject({
      productName: "Sticker kawaii",
      unitsSold: 2,
      productCost: null,
      netProfit: null,
      marginPercentage: null,
      costStatus: "MISSING_ACQUISITION_COST",
      pendingOrderIds: ["2000017890359944"],
    });
  });
});
