import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/inventory", () => ({ recalculateKitStock: vi.fn() }));
vi.mock("@/lib/utils", () => ({ generateOrderNumber: vi.fn() }));

import { getCapsuleMargin, getFairStockAvailability } from "@/lib/fair-events";

describe("fair event inventory helpers", () => {
  it("keeps direct stock, packed capsules, returns, damage, and losses separated", () => {
    expect(
      getFairStockAvailability({
        allocatedQuantity: 20,
        soldQuantity: 6,
        packedQuantity: 4,
        returnedQuantity: 3,
        damagedQuantity: 1,
        lostQuantity: 2,
      }),
    ).toBe(4);
  });

  it("calculates the capsule gross margin from the physical product cost", () => {
    expect(getCapsuleMargin(10000, 6000)).toBe(40);
    expect(getCapsuleMargin(8000, 8000)).toBe(0);
    expect(getCapsuleMargin(5000, 6000)).toBe(-20);
  });

  it("does not accept a zero or negative capsule sale price", () => {
    expect(getCapsuleMargin(0, 2000)).toBe(-Infinity);
    expect(getCapsuleMargin(-1, 2000)).toBe(-Infinity);
  });
});
