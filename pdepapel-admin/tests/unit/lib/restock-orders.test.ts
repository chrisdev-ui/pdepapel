import { describe, expect, it } from "vitest";

import {
  canTransitionRestockOrder,
  deriveRestockStatus,
  describeForbiddenRestockTransition,
  getAllowedRestockTransitions,
  getRestockProgress,
  landedCostFactor,
  landedUnitCost,
  nextRestockOrderNumber,
  parseRestockOrderNumber,
  planReceipt,
  receiptInputSchema,
  restockOrderInputSchema,
  transportationShare,
} from "@/lib/restock-orders";
import { RestockOrderStatus } from "@prisma/client";

describe("restock order lifecycle", () => {
  it("only cancels while nothing has been received", () => {
    expect(getAllowedRestockTransitions(RestockOrderStatus.ORDERED, { receivedUnits: 0 })).toEqual([RestockOrderStatus.COMPLETED, RestockOrderStatus.CANCELLED]);
    expect(getAllowedRestockTransitions(RestockOrderStatus.ORDERED, { receivedUnits: 3 })).toEqual([RestockOrderStatus.COMPLETED]);
    expect(canTransitionRestockOrder(RestockOrderStatus.PARTIALLY_RECEIVED, RestockOrderStatus.CANCELLED, { receivedUnits: 2 })).toBe(false);
    expect(describeForbiddenRestockTransition(RestockOrderStatus.PARTIALLY_RECEIVED, RestockOrderStatus.CANCELLED, { receivedUnits: 2 })).toContain("ya se recibieron 2 unidades");
  });

  it("never reopens a completed order and never hand-picks partial receipt", () => {
    expect(getAllowedRestockTransitions(RestockOrderStatus.COMPLETED, { receivedUnits: 9 })).toEqual([]);
    expect(describeForbiddenRestockTransition(RestockOrderStatus.COMPLETED, RestockOrderStatus.DRAFT, { receivedUnits: 9 })).toContain("completado");
    expect(canTransitionRestockOrder(RestockOrderStatus.ORDERED, RestockOrderStatus.PARTIALLY_RECEIVED, { receivedUnits: 0 })).toBe(false);
    expect(describeForbiddenRestockTransition(RestockOrderStatus.ORDERED, RestockOrderStatus.PARTIALLY_RECEIVED, { receivedUnits: 0 })).toContain("recepción");
  });

  it("lets a draft be ordered or cancelled and a cancelled order go back to draft", () => {
    expect(getAllowedRestockTransitions(RestockOrderStatus.DRAFT, { receivedUnits: 0 })).toEqual([RestockOrderStatus.ORDERED, RestockOrderStatus.CANCELLED]);
    expect(getAllowedRestockTransitions(RestockOrderStatus.CANCELLED, { receivedUnits: 0 })).toEqual([RestockOrderStatus.DRAFT]);
  });
});

describe("restock order numbers", () => {
  it("continues from the highest existing number, not from the row count", () => {
    expect(nextRestockOrderNumber(["PO-0001", "PO-0003"])).toBe("PO-0004");
    expect(nextRestockOrderNumber([])).toBe("PO-0001");
    // Formato antiguo del batch sin ceros: también cuenta.
    expect(nextRestockOrderNumber(["PO-1001", "PO-0036"])).toBe("PO-1002");
    expect(parseRestockOrderNumber("PO-0036")).toBe(36);
    expect(parseRestockOrderNumber("ORD-1")).toBeNull();
  });
});

describe("receipt planning", () => {
  const order = {
    totalAmount: 60000,
    shippingCost: 6000,
    items: [
      { id: "a", productId: "p1", quantity: 2, quantityReceived: 1, cost: 15000 },
      { id: "b", productId: "p2", quantity: 3, quantityReceived: 0, cost: 10000 },
    ],
  };

  it("spreads shipping over merchandise and never divides by zero", () => {
    expect(landedCostFactor(60000, 6000)).toBeCloseTo(1.1);
    expect(landedCostFactor(0, 6000)).toBe(1);
    expect(landedCostFactor(60000, 0)).toBe(1);
    expect(landedUnitCost(15000, 60000, 6000)).toBe(16500);
    expect(transportationShare(15000, 60000, 6000)).toBe(1500);
  });

  it("caps at what is still owed unless the excess is confirmed", () => {
    const capped = planReceipt(order, { lines: [{ restockOrderItemId: "a", quantity: 2, allowExcess: false }] });
    expect(capped).toEqual({ ok: false, error: { kind: "excess-not-confirmed", restockOrderItemId: "a", remaining: 1, requested: 2 } });

    const confirmed = planReceipt(order, {
      lines: [
        { restockOrderItemId: "a", quantity: 2, allowExcess: true },
        { restockOrderItemId: "b", quantity: 0, allowExcess: false },
      ],
    });
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.plan.lines).toEqual([
        { restockOrderItemId: "a", productId: "p1", quantity: 2, excess: 1, unitCost: 15000, landedUnitCost: 16500 },
      ]);
      expect(confirmed.plan.receivedUnits).toBe(2);
      expect(confirmed.plan.excessUnits).toBe(1);
    }
  });

  it("rejects unknown lines and empty receipts", () => {
    expect(planReceipt(order, { lines: [{ restockOrderItemId: "zzz", quantity: 1, allowExcess: false }] })).toEqual({ ok: false, error: { kind: "unknown-line", restockOrderItemId: "zzz" } });
    expect(planReceipt(order, { lines: [{ restockOrderItemId: "a", quantity: 0, allowExcess: false }] })).toEqual({ ok: false, error: { kind: "nothing-to-receive" } });
  });

  it("derives the order status from the lines", () => {
    expect(deriveRestockStatus([{ quantity: 2, quantityReceived: 2 }, { quantity: 3, quantityReceived: 3 }], RestockOrderStatus.ORDERED)).toBe(RestockOrderStatus.COMPLETED);
    expect(deriveRestockStatus([{ quantity: 2, quantityReceived: 1 }, { quantity: 3, quantityReceived: 0 }], RestockOrderStatus.ORDERED)).toBe(RestockOrderStatus.PARTIALLY_RECEIVED);
    expect(deriveRestockStatus([{ quantity: 2, quantityReceived: 0 }], RestockOrderStatus.ORDERED)).toBe(RestockOrderStatus.ORDERED);
    expect(getRestockProgress(order.items)).toEqual({ orderedUnits: 5, receivedUnits: 1, remainingUnits: 4, lineCount: 2, linesComplete: 0 });
  });
});

describe("input parsing", () => {
  it("requires integer quantities and a supplier, in Spanish", () => {
    const bad = restockOrderInputSchema.safeParse({ supplierId: "", items: [{ productId: "p", quantity: 1.5, cost: 10 }] });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const messages = bad.error.issues.map((issue) => issue.message);
      expect(messages).toContain("Elige un proveedor.");
      expect(messages).toContain("La cantidad debe ser un número entero.");
    }
    const ok = restockOrderInputSchema.safeParse({ supplierId: "s", items: [{ productId: "p", quantity: "2", cost: "10" }] });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toMatchObject({ shippingCost: 0, status: RestockOrderStatus.DRAFT, items: [{ quantity: 2, cost: 10 }] });
  });

  it("requires an idempotency key on receipts and defaults the cost update on", () => {
    expect(receiptInputSchema.safeParse({ lines: [{ restockOrderItemId: "a", quantity: 1 }] }).success).toBe(false);
    const ok = receiptInputSchema.safeParse({ idempotencyKey: "3f0c2c2e-9c1b-4b8a-9d0e-2b1d1c1c1c1c", lines: [{ restockOrderItemId: "a", quantity: 1 }] });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toMatchObject({ updateCosts: true, assignSupplier: true, lines: [{ allowExcess: false }] });
  });
});
