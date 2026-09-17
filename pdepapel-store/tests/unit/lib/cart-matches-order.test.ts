import { describe, expect, it } from "vitest";

import { cartMatchesOrder } from "@/lib/cart-matches-order";
import type { OrderItem, Product } from "@/types";

const cart = (...lines: [string, number][]) =>
  lines.map(([id, quantity]) => ({ id, quantity })) as unknown as Product[];

const order = (...lines: [string, number][]) =>
  lines.map(([id, quantity], index) => ({
    id: `line-${index}`,
    product: { id } as Product,
    quantity,
  })) as OrderItem[];

describe("cartMatchesOrder", () => {
  it("recognises the cart that was just paid", () => {
    expect(cartMatchesOrder(cart(["p1", 2], ["p2", 1]), order(["p1", 2], ["p2", 1]))).toBe(true);
  });

  it("ignores the order of the lines", () => {
    expect(cartMatchesOrder(cart(["p2", 1], ["p1", 2]), order(["p1", 2], ["p2", 1]))).toBe(true);
  });

  it("refuses when a quantity differs", () => {
    expect(cartMatchesOrder(cart(["p1", 3]), order(["p1", 2]))).toBe(false);
  });

  it("refuses when the cart carries something the order does not", () => {
    expect(cartMatchesOrder(cart(["p1", 1], ["p3", 1]), order(["p1", 1]))).toBe(false);
  });

  it("refuses when the order carries something the cart does not", () => {
    expect(cartMatchesOrder(cart(["p1", 1]), order(["p1", 1], ["p3", 1]))).toBe(false);
  });

  it("never clears an empty cart, and never matches an order without lines", () => {
    expect(cartMatchesOrder([], order(["p1", 1]))).toBe(false);
    expect(cartMatchesOrder(cart(["p1", 1]), [])).toBe(false);
  });

  it("falls back to productId when the line has no embedded product", () => {
    const lines = [
      { id: "line-0", productId: "p1", quantity: 2 },
    ] as OrderItem[];
    expect(cartMatchesOrder(cart(["p1", 2]), lines)).toBe(true);
  });

  it("adds up a product that appears on two lines of the same order", () => {
    expect(cartMatchesOrder(cart(["p1", 3]), order(["p1", 1], ["p1", 2]))).toBe(true);
  });

  it("treats a missing cart quantity as one unit", () => {
    const lines = [{ id: "p1" }] as unknown as Product[];
    expect(cartMatchesOrder(lines, order(["p1", 1]))).toBe(true);
  });

  it("refuses rather than guessing when a line has no product id", () => {
    const lines = [{ id: "line-0", quantity: 1 }] as OrderItem[];
    expect(cartMatchesOrder(cart(["p1", 1]), lines)).toBe(false);
  });

  it("refuses a nonsensical quantity instead of clearing the cart", () => {
    expect(cartMatchesOrder(cart(["p1", 0]), order(["p1", 0]))).toBe(false);
    expect(cartMatchesOrder(cart(["p1", Number.NaN]), order(["p1", 1]))).toBe(false);
  });
});
