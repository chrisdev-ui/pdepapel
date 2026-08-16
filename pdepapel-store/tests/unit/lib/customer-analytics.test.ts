import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics/react", () => ({ track: vi.fn() }));

import {
  getAnalyticsValue,
  toAnalyticsItem,
} from "@/lib/customer-analytics";
import { Product } from "@/types";

const product = {
  brand: "P de Papel",
  category: { id: "category-id", name: "Agendas", typeId: "type-id" },
  color: { id: "color-id", name: "Lila", value: "#c9b6e4" },
  description: "Agenda con flores",
  design: { id: "design-id", name: "Flores" },
  id: "product-id",
  images: [],
  isFeatured: false,
  name: "Agenda floral",
  price: "18000",
  reviews: [],
  size: { id: "size-id", name: "Mediana", value: "M" },
  sku: "AGENDA-001",
  stock: 4,
} as Product;

describe("customer analytics items", () => {
  it("uses catalog metadata without customer information", () => {
    expect(toAnalyticsItem(product, 2)).toEqual({
      item_brand: "P de Papel",
      item_category: "Agendas",
      item_id: "AGENDA-001",
      item_name: "Agenda floral",
      item_variant: "Flores · Lila · Mediana",
      price: 18000,
      quantity: 2,
    });
  });

  it("calculates event value from item prices and quantities", () => {
    expect(
      getAnalyticsValue([
        { item_id: "one", item_name: "Uno", price: 10000, quantity: 2 },
        { item_id: "two", item_name: "Dos", price: 5000, quantity: 1 },
      ]),
    ).toBe(25000);
  });
});
