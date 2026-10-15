import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "development" } }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/utils", () => ({ generateOrderNumber: vi.fn() }));
vi.mock("@/lib/product-pricing", () => ({ priceLines: vi.fn() }));
vi.mock("@/lib/order-totals", () => ({ calculateOrderTotals: vi.fn() }));
vi.mock("@/lib/reservation-counters", () => ({ HOLDING_RESERVATION_STATUSES: ["ACTIVE", "CONVERTED"] }));

import { headerMirror, reservationLines } from "@/lib/reservation-header";
import { MAX_RESERVATION_ITEMS, parseReservationItems } from "@/lib/stock-reservations";

describe("productos de una reserva", () => {
  it("acepta items[] y, como antes, un solo productId; el repetido se suma", () => {
    expect(parseReservationItems({ productId: "a", quantity: 2 })).toEqual([{ productId: "a", quantity: 2 }]);
    expect(parseReservationItems({ items: [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 1 }, { productId: "a", quantity: 3 }] })).toEqual([
      { productId: "a", quantity: 4 },
      { productId: "b", quantity: 1 },
    ]);
  });

  it("rechaza lo vacío, un producto sin id, cantidades fuera de rango y más de 50 productos", () => {
    expect(() => parseReservationItems({ items: [] })).toThrow("Elige al menos un producto");
    expect(() => parseReservationItems({})).toThrow("Elige al menos un producto");
    expect(() => parseReservationItems({ items: [{ productId: "", quantity: 1 }] })).toThrow("Elige el producto");
    expect(() => parseReservationItems({ items: [{ productId: "a", quantity: 0 }] })).toThrow("entre 1 y 999");
    expect(() => parseReservationItems({ items: [{ productId: "a", quantity: 600 }, { productId: "a", quantity: 600 }] })).toThrow("entre 1 y 999");
    const many = Array.from({ length: MAX_RESERVATION_ITEMS + 1 }, (_, index) => ({ productId: `p-${index}`, quantity: 1 }));
    expect(() => parseReservationItems({ items: many })).toThrow("hasta 50 productos");
  });

  it("el encabezado lleva el producto solo cuando hay uno; los ítems mandan sobre el encabezado", () => {
    expect(headerMirror([{ productId: "a", quantity: 2 }])).toEqual({ productId: "a", quantity: 2 });
    expect(headerMirror([{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }])).toEqual({ productId: null, quantity: null });
    expect(reservationLines({ productId: "viejo", quantity: 9, items: [{ productId: "a", quantity: 2 }] })).toEqual([{ productId: "a", quantity: 2 }]);
    expect(reservationLines({ productId: "viejo", quantity: 9, items: [] })).toEqual([{ productId: "viejo", quantity: 9 }]);
    expect(() => reservationLines({ productId: null, quantity: null, items: [] })).toThrow();
  });
});
