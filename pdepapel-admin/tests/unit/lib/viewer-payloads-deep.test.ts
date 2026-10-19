import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { scrubFairEvent, scrubOrder, scrubProduct, scrubProductGroup } from "@/lib/viewer-payloads";

import { assertNoForbiddenKeys } from "../../helpers/forbidden-keys";

const component = { id: "p2", name: "Lápiz", acqPrice: 800, transportationCost: 100, supplierId: "sup", supplier: { id: "sup", name: "Henko" }, soldCount: 9 };
const kit = {
  id: "k1",
  name: "Kit",
  price: new Prisma.Decimal("30000.50"),
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  acqPrice: 1600,
  kitComponents: [{ quantity: 2, component: { ...component, category: { id: "c", name: "Lápices" }, images: [{ url: "a.jpg" }] } }],
  productGroup: { id: "g", name: "Grupo", products: [{ id: "v1", name: "Variante", acqPrice: 500, transportationCost: 50 }] },
  reviews: [{ id: "r1", rating: 5, comment: "Bien", userId: "user_1", moderationNote: "ok", moderatedBy: "owner", repliedBy: "owner" }],
};

/**
 * `scrubProduct` limpiaba solo el primer nivel: las piezas de un kit, las
 * variantes del grupo y las reseñas llegaban con costos, proveedor y
 * quién escribió. Ahora recorre todo lo que cuelga del producto.
 */
describe("scrubProduct recursivo", () => {
  it("quita costos, proveedor, ventas y datos de reseña a cualquier profundidad", () => {
    assertNoForbiddenKeys(scrubProduct(kit), "viewer");
  });

  it("deja intactos los valores que no son objetos literales (Decimal, Date) y lo demás", () => {
    const clean = scrubProduct(kit) as typeof kit;
    expect(clean.price).toBeInstanceOf(Prisma.Decimal);
    expect(clean.price.toString()).toBe("30000.5");
    expect(clean.createdAt).toBeInstanceOf(Date);
    expect(clean.kitComponents[0]).toMatchObject({ quantity: 2, component: { id: "p2", name: "Lápiz", category: { name: "Lápices" }, images: [{ url: "a.jpg" }] } });
    expect(clean.reviews[0]).toMatchObject({ id: "r1", rating: 5, comment: "Bien" });
    expect(kit.kitComponents[0].component.acqPrice).toBe(800);
  });

  it("lo heredan los demás: grupo, pedido (líneas) y feria (filas con piezas de kit)", () => {
    assertNoForbiddenKeys(scrubProductGroup({ id: "g", products: [kit] }), "viewer");
    assertNoForbiddenKeys(scrubOrder({ id: "o", orderItems: [{ id: "i", product: kit }] }), "viewer");
    const fair = { id: "f", inventoryItems: [{ id: "row", product: kit, kitComponents: [{ componentId: "p2", quantityPerKit: 2, component }] }], capsules: [], orders: [] };
    assertNoForbiddenKeys(scrubFairEvent(fair), "viewer");
  });
});
