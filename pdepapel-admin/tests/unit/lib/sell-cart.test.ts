import { describe, expect, it } from "vitest";

import { addLineToCart, cartTotals, removeLine, setLineQuantity, type SellLine } from "@/lib/sell-cart";

const product = (overrides: Partial<SellLine> = {}): SellLine => ({
  key: "product-1",
  productId: "1",
  name: "Libreta",
  price: 12000,
  quantity: 1,
  maxQuantity: 3,
  ...overrides,
});

const capsule: SellLine = {
  key: "capsule-ABC",
  productId: null,
  name: "Cápsula sorpresa",
  detail: "ABC",
  price: 15000,
  quantity: 1,
  maxQuantity: 1,
  fixedQuantity: true,
};

describe("sell-cart", () => {
  it("adds a product once and increments it up to its limit", () => {
    let { cart } = addLineToCart([], product());
    expect(cart).toHaveLength(1);
    ({ cart } = addLineToCart(cart, product()));
    ({ cart } = addLineToCart(cart, product()));
    expect(cart[0].quantity).toBe(3);
    const blocked = addLineToCart(cart, product());
    expect(blocked.cart[0].quantity).toBe(3);
    expect(blocked.error?.title).toBe("No hay más unidades disponibles");
  });

  it("refuses sold-out products and duplicate capsules", () => {
    expect(addLineToCart([], product({ maxQuantity: 0 })).error?.title).toBe("Producto agotado");
    const { cart } = addLineToCart([], capsule);
    const again = addLineToCart(cart, capsule);
    expect(again.cart).toHaveLength(1);
    expect(again.error?.title).toContain("ya está en la venta");
  });

  it("clamps quantities to the limit and ignores capsules", () => {
    const { cart } = addLineToCart(addLineToCart([], product()).cart, capsule);
    const over = setLineQuantity(cart, "product-1", 10);
    expect(over.cart.find((line) => line.key === "product-1")?.quantity).toBe(3);
    expect(over.error?.title).toBe("Cantidad no disponible");
    const capsuleChange = setLineQuantity(cart, "capsule-ABC", 4);
    expect(capsuleChange.cart.find((line) => line.key === "capsule-ABC")?.quantity).toBe(1);
    expect(capsuleChange.error).toBeUndefined();
    expect(setLineQuantity(cart, "product-1", 0).cart[0].quantity).toBe(1);
  });

  it("totals and removes lines", () => {
    const { cart } = addLineToCart(addLineToCart([], product({ quantity: 2 })).cart, capsule);
    expect(cartTotals(cart)).toEqual({ total: 39000, units: 3, lines: 2 });
    expect(removeLine(cart, "capsule-ABC")).toHaveLength(1);
  });

  it("allows unlimited lines when no limit is known", () => {
    let { cart } = addLineToCart([], product({ maxQuantity: null }));
    for (let i = 0; i < 20; i += 1) ({ cart } = addLineToCart(cart, product({ maxQuantity: null })));
    expect(cart[0].quantity).toBe(21);
  });
});
