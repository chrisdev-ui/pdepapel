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

const buildProduct = (overrides: Partial<Product> = {}) =>
  ({
    id: "product-1",
    name: "Cuaderno A5",
    description: "",
    price: "25000",
    stock: 3,
    isFeatured: false,
    sku: "CUA-A5",
    category: { id: "category-1", typeId: "type-1", name: "Cuadernos" },
    size: { id: "size-1", name: "Interno", value: "S-P" },
    color: { id: "color-1", name: "Rosa", value: "#f9a" },
    design: { id: "design-1", name: "Kawaii" },
    images: [],
    reviews: [],
    ...overrides,
  }) as Product;

describe("cart mutations", () => {
  beforeAll(async () => {
    ({ useCart } = await import("@/hooks/use-cart"));
  });

  beforeEach(() => {
    storage.clear();
    useCart.setState({ items: [] });
  });

  it("adds and updates a product without mutating the prior object", () => {
    const product = buildProduct();
    const added = useCart.getState().addItem(product, 1);
    const firstCartItem = useCart.getState().items[0];
    const updated = useCart.getState().addItem(product, 1);

    expect(added).toMatchObject({ ok: true, status: "added" });
    expect(updated).toMatchObject({ ok: true, status: "updated" });
    expect(useCart.getState().items[0].quantity).toBe(2);
    expect(firstCartItem.quantity).toBe(1);
  });

  it("rejects quantities above stock and leaves the cart unchanged", () => {
    const product = buildProduct({ stock: 1 });
    useCart.getState().addItem(product, 1);

    const result = useCart.getState().addItem(product, 1);

    expect(result).toMatchObject({ ok: false, status: "stock_limit" });
    expect(useCart.getState().items[0].quantity).toBe(1);
  });

  it("rejects archived or unavailable products", () => {
    const result = useCart
      .getState()
      .addItem(buildProduct({ isArchived: true }), 1);

    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    expect(useCart.getState().items).toEqual([]);
  });

  it("updates an existing line using an absolute quantity", () => {
    useCart.getState().addItem(buildProduct(), 1);

    const result = useCart.getState().updateQuantity("product-1", 3);

    expect(result).toMatchObject({ ok: true, status: "updated" });
    expect(useCart.getState().items[0].quantity).toBe(3);
  });
});
