import { describe, expect, it, vi } from "vitest";

import { assertValidKitComponents, deriveKitStock, settleKitStock } from "@/lib/product-kit-conversion";

describe("deriveKitStock", () => {
  it("is limited by the scarcest component and never negative", () => {
    expect(deriveKitStock([{ quantity: 1, componentStock: 12 }, { quantity: 2, componentStock: 7 }])).toBe(3);
    expect(deriveKitStock([])).toBe(0);
    expect(deriveKitStock([{ quantity: 0, componentStock: 5 }])).toBe(0);
  });
});

describe("assertValidKitComponents", () => {
  const tx = (rows: { id: string; name: string; isKit: boolean; isArchived: boolean }[]) => ({
    product: { findMany: vi.fn().mockResolvedValue(rows) },
  });

  it("refuses the kit itself, other kits, archived and foreign products", async () => {
    await expect(
      assertValidKitComponents(tx([]) as never, { storeId: "s", kitId: "k1", components: [{ componentId: "k1" }] }),
    ).rejects.toThrow(/a sí mismo/);
    await expect(
      assertValidKitComponents(tx([]) as never, { storeId: "s", components: [{ componentId: "x" }] }),
    ).rejects.toThrow(/no existe en esta tienda/);
    await expect(
      assertValidKitComponents(tx([{ id: "a", name: "Kit escolar", isKit: true, isArchived: false }]) as never, {
        storeId: "s",
        components: [{ componentId: "a" }],
      }),
    ).rejects.toThrow(/otro kit/);
    await expect(
      assertValidKitComponents(tx([{ id: "a", name: "Viejo", isKit: false, isArchived: true }]) as never, {
        storeId: "s",
        components: [{ componentId: "a" }],
      }),
    ).rejects.toThrow(/archivados/);
    await expect(
      assertValidKitComponents(tx([{ id: "a", name: "Cinta", isKit: false, isArchived: false }]) as never, {
        storeId: "s",
        components: [{ componentId: "a" }],
      }),
    ).resolves.toBeUndefined();
  });
});

describe("settleKitStock", () => {
  it("writes the adjustment that explains the jump from physical stock to derived stock", async () => {
    const update = vi.fn();
    const create = vi.fn().mockResolvedValue({ id: "m1" });
    const tx = {
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: "p", stock: 7, isKit: true,
          kitComponents: [{ quantity: 2, component: { stock: 7 } }, { quantity: 1, component: { stock: 40 } }],
        }),
        update,
      },
      inventoryMovement: { create },
      productKit: {},
    };
    const result = await settleKitStock(tx as never, { storeId: "s", productId: "p", reason: "Conversión a kit", createdBy: "u" });
    expect(result).toMatchObject({ previousStock: 7, newStock: 3, quantity: -4 });
    expect(update).toHaveBeenCalledWith({ where: { id: "p" }, data: { stock: 3 } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "MANUAL_ADJUSTMENT", quantity: -4, previousStock: 7, newStock: 3, reason: "Conversión a kit" }),
    }));
  });

  it("keeps the derived number as own stock when a kit is dissolved, with a zero movement for the record", async () => {
    const update = vi.fn();
    const create = vi.fn().mockResolvedValue({ id: "m2" });
    const tx = {
      product: { findFirst: vi.fn().mockResolvedValue({ id: "p", stock: 3, isKit: false, kitComponents: [] }), update },
      inventoryMovement: { create },
      productKit: {},
    };
    const result = await settleKitStock(tx as never, { storeId: "s", productId: "p", reason: "Deja de ser kit" });
    expect(result).toMatchObject({ previousStock: 3, newStock: 3, quantity: 0 });
    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
  });
});
