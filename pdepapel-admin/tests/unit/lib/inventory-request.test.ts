import { resolveInventoryMovementQuantity } from "@/lib/inventory-request";
import { describe, expect, it } from "vitest";

describe("resolveInventoryMovementQuantity", () => {
  it("uses the explicit subtract action for manual adjustments", () => {
    expect(
      resolveInventoryMovementQuantity({
        action: "subtract",
        quantity: 3,
        type: "MANUAL_ADJUSTMENT",
      }),
    ).toBe(-3);
  });

  it("uses the explicit add action for manual adjustments", () => {
    expect(
      resolveInventoryMovementQuantity({
        action: "add",
        quantity: -3,
        type: "MANUAL_ADJUSTMENT",
      }),
    ).toBe(3);
  });

  it("keeps legacy manual-adjustment requests compatible", () => {
    expect(
      resolveInventoryMovementQuantity({
        quantity: -2,
        type: "MANUAL_ADJUSTMENT",
      }),
    ).toBe(-2);
  });

  it("enforces the direction required by each predefined movement type", () => {
    expect(
      resolveInventoryMovementQuantity({
        quantity: 4,
        type: "DAMAGE",
      }),
    ).toBe(-4);
    expect(
      resolveInventoryMovementQuantity({
        quantity: -4,
        type: "PURCHASE",
      }),
    ).toBe(4);
  });
});
