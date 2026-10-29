import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Product } from "@/types";

const storage = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
  configurable: true,
});

let useCart: typeof import("@/hooks/use-cart").useCart;
let conflictsWithDepositPresale: typeof import("@/hooks/use-cart").conflictsWithDepositPresale;

const normal = (id = "lapicero") =>
  ({ id, name: "Lapicero", description: "", price: "5000", stock: 9, images: [], reviews: [] }) as unknown as Product;

const depositPresale = (id = "calendario", overrides: Record<string, unknown> = {}) =>
  ({
    id,
    name: "Calendario de adviento",
    description: "",
    price: "160000",
    stock: 0,
    images: [],
    reviews: [],
    presales: [
      {
        id: `ps-${id}`,
        expectedArrivalAt: null,
        expectedArrivalText: null,
        unitLimit: null,
        committedUnits: 0,
        paymentMode: "DEPOSIT",
        depositType: "FIXED",
        depositValue: 30000,
        termsText: null,
        ...overrides,
      },
    ],
  }) as unknown as Product;

describe("una preventa con anticipo se compra sola", () => {
  beforeAll(async () => {
    ({ useCart, conflictsWithDepositPresale } = await import("@/hooks/use-cart"));
  });

  beforeEach(() => {
    storage.clear();
    useCart.setState({ items: [] });
  });

  it("entra a un carrito vacío", () => {
    const result = useCart.getState().addItem(depositPresale(), 2);
    expect(result).toMatchObject({ ok: true, status: "added" });
    expect(useCart.getState().items).toHaveLength(1);
  });

  it("no entra a un carrito con otras cosas: se pregunta antes (presale_alone)", () => {
    useCart.getState().addItem(normal(), 1);
    const result = useCart.getState().addItem(depositPresale(), 1);
    expect(result).toMatchObject({ ok: false, status: "presale_alone" });
    expect(useCart.getState().items.map((item) => item.id)).toEqual(["lapicero"]);
  });

  it("nada entra a un carrito que tiene una preventa con anticipo, ni otra preventa", () => {
    useCart.getState().addItem(depositPresale(), 1);
    expect(useCart.getState().addItem(normal(), 1)).toMatchObject({ ok: false, status: "presale_alone" });
    expect(useCart.getState().addItem(depositPresale("otro-calendario"), 1)).toMatchObject({ ok: false, status: "presale_alone" });
    expect(useCart.getState().items.map((item) => item.id)).toEqual(["calendario"]);
  });

  it("sumar unidades de la misma preventa no es mezclar", () => {
    useCart.getState().addItem(depositPresale(), 1);
    expect(useCart.getState().addItem(depositPresale(), 1)).toMatchObject({ ok: true, status: "updated" });
    expect(useCart.getState().items[0].quantity).toBe(2);
  });

  it("sin tope, el límite es 5 por pedido", () => {
    expect(useCart.getState().addItem(depositPresale(), 6)).toMatchObject({ ok: false, status: "stock_limit" });
    expect(useCart.getState().addItem(depositPresale(), 5)).toMatchObject({ ok: true });
  });

  it("una preventa completa (FULL) se sigue mezclando como hoy", () => {
    useCart.getState().addItem(normal(), 1);
    const full = depositPresale("agenda", { paymentMode: "FULL", unitLimit: 40 });
    expect(useCart.getState().addItem(full, 1)).toMatchObject({ ok: true });
    expect(conflictsWithDepositPresale(useCart.getState().items, normal("otro"))).toBe(false);
  });

  it("una preventa con «llega pronto» se puede reservar igual", () => {
    const future = { ...depositPresale(), availableAt: "2099-01-01T00:00:00.000Z" } as Product;
    expect(useCart.getState().addItem(future, 1)).toMatchObject({ ok: true });
  });
});
