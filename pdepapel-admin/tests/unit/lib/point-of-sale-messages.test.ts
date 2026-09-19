import { OrderStatus, OrderType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/utils", () => ({ generateOrderNumber: () => "V-TEST" }));
vi.mock("@/lib/bold-terminal", () => ({ pushToBoldDatafono: vi.fn() }));
vi.mock("@/lib/discount-engine", () => ({ getProductsPrices: vi.fn() }));
vi.mock("@/lib/inventory", () => ({ createInventoryMovementBatch: vi.fn(), recalculateKitStock: vi.fn() }));
vi.mock("@/lib/order-stock-movements", () => ({ explodeKitMovements: vi.fn() }));
vi.mock("@/lib/mercadolibre/outbox", () => ({ queueMarketplaceStockSyncEvents: vi.fn() }));

import { describeInsufficientStock, describeUndoBlock, POINT_OF_SALE_PAYMENT_METHODS, TRANSFER_REFERENCE_MIN } from "@/lib/point-of-sale";

/** Vender: mensajes claros en vez del aviso técnico de varias líneas. */
describe("point-of-sale · messages", () => {
  it("names each product with what there is and what was asked, and says nothing was recorded", () => {
    const text = describeInsufficientStock([
      { productName: "Libreta", available: 1, requested: 3 },
      { productName: "Washi", available: 0, requested: 1 },
    ]);
    expect(text).toBe("No alcanzó el inventario: Libreta (hay 1, pediste 3); Washi (hay 0, pediste 1). No se registró nada; ajusta las cantidades o revisa Inventario.");
  });

  it("keeps the message short when many products fail", () => {
    const text = describeInsufficientStock(
      ["A", "B", "C", "D", "E"].map((productName) => ({ productName, available: 0, requested: 1 })),
    );
    expect(text).toContain("C (hay 0, pediste 1) y 2 más.");
    expect(text).not.toContain("D (hay");
  });

  it("offers cash, transfer and card terminal, and asks for at least four characters of reference", () => {
    expect(POINT_OF_SALE_PAYMENT_METHODS).toEqual(["CASH", "BankTransfer", "Bold"]);
    expect(TRANSFER_REFERENCE_MIN).toBe(4);
  });

  it("allows undo only for paid point-of-sale orders inside 30 minutes, or pending terminal charges", () => {
    const base = { type: OrderType.POINT_OF_SALE, status: OrderStatus.PAID, paidAt: new Date("2026-09-19T15:00:00Z"), orderNumber: "V-1" };
    const soon = new Date("2026-09-19T15:29:00Z");
    const late = new Date("2026-09-19T15:31:00Z");
    expect(describeUndoBlock(base, soon)).toBeNull();
    expect(describeUndoBlock(base, late)).toMatch(/Pasaron más de 30 minutos/);
    expect(describeUndoBlock({ ...base, status: OrderStatus.PENDING, paidAt: null }, late)).toBeNull();
    expect(describeUndoBlock({ ...base, status: OrderStatus.CANCELLED }, soon)).toBe("La venta V-1 ya estaba deshecha.");
    expect(describeUndoBlock({ ...base, status: OrderStatus.SENT }, soon)).toMatch(/ya no se puede deshacer/);
    expect(describeUndoBlock({ ...base, type: OrderType.STANDARD }, soon)).toBe("Solo se deshacen ventas del punto de venta.");
  });
});
