import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { isBlockedByPresaleForMercadoLibre, loadMercadoLibreSellable, mercadoLibreQuantity } from "@/lib/mercadolibre/available-quantity";

type Row = { id: string; stock: number; reservedUnits: number; isKit: boolean; kitComponents: { componentId: string }[] };

type Where = { where: { id?: { in: string[] }; isKit?: boolean; productId?: { in: string[] } } };

const db = (products: Row[], inPresale: string[], openPreorderLines: string[] = []) => ({
  product: {
    findMany: vi.fn(async ({ where }: Where) => products.filter((product) => where.id!.in.includes(product.id) && (where.isKit === undefined || product.isKit === where.isKit))),
  },
  productPresale: {
    findMany: vi.fn(async ({ where }: Where) => where.productId!.in.filter((id) => inPresale.includes(id)).map((productId) => ({ productId }))),
  },
  orderItem: {
    findMany: vi.fn(async ({ where }: Where) => where.productId!.in.filter((id) => openPreorderLines.includes(id)).map((productId) => ({ productId }))),
  },
});

const product = (id: string, stock: number, overrides: Partial<Row> = {}): Row => ({ id, stock, reservedUnits: 0, isKit: false, kitComponents: [], ...overrides });

/**
 * Lo que se le ofrece a Mercado Libre: stock − apartados − colchón; cero con
 * una preventa activa o una línea de preventa sin liberar, y cero en un kit al
 * que le pase eso a una pieza. Es la misma cuenta al publicar, encolar, enviar
 * y conciliar.
 */
describe("cantidad para Mercado Libre", () => {
  it("resta los apartados y el colchón, sin bajar de cero", async () => {
    const sellable = await loadMercadoLibreSellable(db([product("p1", 5, { reservedUnits: 2 })], []) as never, ["p1"]);
    expect(sellable.get("p1")).toBe(3);
    expect(mercadoLibreQuantity(sellable.get("p1"), 1)).toBe(2);
    expect(mercadoLibreQuantity(sellable.get("p1"), 9)).toBe(0);
    expect(mercadoLibreQuantity(undefined, 0)).toBe(0);
  });

  it("un producto en preventa activa ofrece cero aunque tenga stock", async () => {
    const sellable = await loadMercadoLibreSellable(db([product("p1", 40)], ["p1"]) as never, ["p1"]);
    expect(sellable.get("p1")).toBe(0);
  });

  it("un kit con una pieza en preventa ofrece cero; el resto de kits sigue igual", async () => {
    const kitA = product("kit-a", 6, { isKit: true, kitComponents: [{ componentId: "c1" }, { componentId: "c2" }] });
    const kitB = product("kit-b", 4, { isKit: true, kitComponents: [{ componentId: "c3" }] });
    const sellable = await loadMercadoLibreSellable(db([kitA, kitB], ["c2"]) as never, ["kit-a", "kit-b"]);
    expect(sellable.get("kit-a")).toBe(0);
    expect(sellable.get("kit-b")).toBe(4);
  });

  it("una línea de preventa sin liberar deja fuera el producto y sus kits aunque la campaña ya no esté activa", async () => {
    const kit = product("kit-a", 6, { isKit: true, kitComponents: [{ componentId: "c1" }] });
    await expect(isBlockedByPresaleForMercadoLibre("c1", db([product("c1", 3)], [], ["c1"]) as never)).resolves.toBe(true);
    await expect(isBlockedByPresaleForMercadoLibre("kit-a", db([kit], [], ["c1"]) as never)).resolves.toBe(true);
    await expect(isBlockedByPresaleForMercadoLibre("kit-a", db([kit], []) as never)).resolves.toBe(false);
    await expect(isBlockedByPresaleForMercadoLibre("p1", db([product("p1", 1)], []) as never)).resolves.toBe(false);
  });
});
