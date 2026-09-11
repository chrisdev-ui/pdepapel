import {
  MarketplaceInventoryStatus,
  MarketplaceOrderStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueOutbox: vi.fn(),
  findListings: vi.fn(),
  findOrder: vi.fn(),
  recalculateKitStock: vi.fn(),
  shipmentUpdateMany: vi.fn(),
  updateOrder: vi.fn(),
  upsertOrder: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceListing: { findMany: mocks.findListings },
    marketplaceOrder: {
      findUnique: mocks.findOrder,
      update: mocks.updateOrder,
      upsert: mocks.upsertOrder,
    },
    marketplaceShipment: { updateMany: mocks.shipmentUpdateMany },
  },
}));
vi.mock("@/lib/inventory", () => ({
  recalculateKitStock: mocks.recalculateKitStock,
}));
vi.mock("@/lib/mercadolibre/outbox", () => ({
  enqueuePendingMarketplaceOutboxEvents: mocks.enqueueOutbox,
  queueMarketplaceOrderFinancials: vi.fn(),
  queueMarketplaceOrderNotification: vi.fn(),
  queueMarketplaceStockSyncEvents: vi.fn(),
}));

import {
  getMarketplaceOrderStatus,
  isMercadoLibreOrderNewlyPaid,
  parseMercadoLibreOrder,
  synchronizeMercadoLibreOrder,
} from "@/lib/mercadolibre/order-sync";

describe("Mercado Libre order parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findListings.mockResolvedValue([]);
    mocks.findOrder.mockResolvedValue({ status: MarketplaceOrderStatus.PAID });
    mocks.upsertOrder.mockResolvedValue({
      id: "marketplace-order-id",
      inventoryStatus: MarketplaceInventoryStatus.DECREMENTED,
      netAmount: 46_457,
    });
    mocks.shipmentUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("normalizes a confirmed sale without trusting the webhook payload", () => {
    const order = parseMercadoLibreOrder({
      id: 2000001,
      status: "paid",
      pack_id: 3000001,
      total_amount: 35_000,
      currency_id: "COP",
      date_closed: "2026-08-07T15:30:00.000Z",
      date_last_updated: "2026-08-07T15:31:00.000Z",
      buyer: { first_name: "Ana", last_name: "Pérez" },
      shipping: { id: 4000001 },
      order_items: [
        {
          quantity: 2,
          unit_price: 17_500,
          item: {
            id: "MCO123",
            variation_id: 987,
            title: "Agenda kawaii",
            seller_sku: "AGENDA-01",
          },
        },
      ],
    });

    expect(order).toMatchObject({
      externalOrderId: "2000001",
      externalPackId: "3000001",
      status: "PAID",
      shipmentId: "4000001",
      buyerName: "Ana Pérez",
      totalAmount: 35_000,
      currencyId: "COP",
      items: [
        {
          externalItemId: "MCO123",
          externalVariationId: "987",
          quantity: 2,
          unitPrice: 17_500,
        },
      ],
    });
    expect(order.paidAt).toEqual(new Date("2026-08-07T15:30:00.000Z"));
  });

  it("maps every raw status deliberately: refunds never fall back to PENDING", () => {
    expect(getMarketplaceOrderStatus("paid").status).toBe("PAID");
    expect(getMarketplaceOrderStatus("paid", { amount: 5_000, chargedBack: false })).toEqual({
      status: "PAID",
      reason: "refund",
    });
    expect(getMarketplaceOrderStatus("partially_refunded")).toEqual({
      status: "PARTIALLY_REFUNDED",
      reason: "partially_refunded",
    });
    expect(getMarketplaceOrderStatus("pending_cancel")).toEqual({
      status: "REFUNDED",
      reason: "pending_cancel",
    });
    expect(getMarketplaceOrderStatus("paid", { amount: 0, chargedBack: true })).toEqual({
      status: "REFUNDED",
      reason: "charged_back",
    });
    expect(getMarketplaceOrderStatus("cancelled").status).toBe("CANCELLED");
    expect(getMarketplaceOrderStatus("invalid").status).toBe("CANCELLED");
    expect(getMarketplaceOrderStatus("payment_in_process").status).toBe("PENDING");
    expect(getMarketplaceOrderStatus("confirmed").status).toBe("PENDING");
  });

  it("reads the refunded amount from the payments and keeps the sale paid when Mercado Libre does", () => {
    const order = parseMercadoLibreOrder({
      id: "2000003",
      status: "paid",
      total_amount: 69_000,
      date_closed: "2026-08-07T15:30:00.000Z",
      payments: [
        { status: "approved", transaction_amount: 69_000, transaction_amount_refunded: 10_000 },
        { status: "approved", transaction_amount: 0, transaction_amount_refunded: "x" },
      ],
      order_items: [
        { quantity: 1, unit_price: 69_000, item: { id: "MCO125", title: "Agenda" } },
      ],
    });
    expect(order.status).toBe("PAID");
    expect(order.refund).toEqual({ amount: 10_000, reason: "refund", rawStatus: "paid" });
    expect(order.paidAt).toEqual(new Date("2026-08-07T15:30:00.000Z"));

    const partial = parseMercadoLibreOrder({
      id: "2000004",
      status: "partially_refunded",
      total_amount: 69_000,
      date_created: "2026-08-01T10:00:00.000Z",
      payments: [{ status: "approved", transaction_amount_refunded: 20_000 }],
      order_items: [
        { quantity: 1, unit_price: 69_000, item: { id: "MCO125", title: "Agenda" } },
      ],
    });
    expect(partial.status).toBe("PARTIALLY_REFUNDED");
    expect(partial.refund.amount).toBe(20_000);
    // Sin date_closed se usa date_created, no «ahora».
    expect(partial.paidAt).toEqual(new Date("2026-08-01T10:00:00.000Z"));
  });

  it("keeps cancelled orders out of automatic restocking", () => {
    const order = parseMercadoLibreOrder({
      id: "2000002",
      status: "cancelled",
      order_items: [
        {
          quantity: 1,
          unit_price: 10_000,
          item: { id: "MCO124", title: "Sticker" },
        },
      ],
    });

    expect(order.status).toBe("CANCELLED");
    expect(order.paidAt).toBeNull();
  });

  it("notifies only when an order first becomes paid", () => {
    expect(
      isMercadoLibreOrderNewlyPaid(null, MarketplaceOrderStatus.PAID),
    ).toBe(true);
    expect(
      isMercadoLibreOrderNewlyPaid(
        MarketplaceOrderStatus.PENDING,
        MarketplaceOrderStatus.PAID,
      ),
    ).toBe(true);
    expect(
      isMercadoLibreOrderNewlyPaid(
        MarketplaceOrderStatus.PAID,
        MarketplaceOrderStatus.PAID,
      ),
    ).toBe(false);
    expect(
      isMercadoLibreOrderNewlyPaid(
        MarketplaceOrderStatus.PAID,
        MarketplaceOrderStatus.CANCELLED,
      ),
    ).toBe(false);
  });

  it("cancels an undelivered shipment without automatically restoring stock", async () => {
    const result = await synchronizeMercadoLibreOrder(
      "connection-id",
      "store-id",
      {
        id: 2000017813937484,
        status: "cancelled",
        total_amount: 69_000,
        date_last_updated: "2026-08-19T13:30:00.000Z",
        shipping: { id: 47712931618 },
        order_items: [
          {
            quantity: 1,
            unit_price: 69_000,
            item: { id: "MCO123", title: "Agenda kawaii" },
          },
        ],
      },
    );

    expect(result).toEqual({ inventoryChanged: false, needsAttention: false });
    expect(mocks.shipmentUpdateMany).toHaveBeenCalledWith({
      where: {
        connectionId: "connection-id",
        status: { in: ["pending", "handling", "ready_to_ship"] },
        OR: [
          { marketplaceOrderId: "marketplace-order-id" },
          { externalShipmentId: "47712931618" },
        ],
      },
      data: {
        status: "cancelled",
        substatus: "cancelled_with_order",
        lastRemoteUpdateAt: new Date("2026-08-19T13:30:00.000Z"),
      },
    });
    expect(mocks.updateOrder).toHaveBeenCalledWith({
      where: { id: "marketplace-order-id" },
      data: {
        inventoryStatus: MarketplaceInventoryStatus.RESTOCK_PENDING,
        inventoryError:
          "La venta fue cancelada. Confirma el retorno físico antes de devolver unidades al inventario.",
      },
    });
    expect(mocks.recalculateKitStock).not.toHaveBeenCalled();
  });
});
