import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildPickingList,
  countShipmentViews,
  getDispatchDate,
  getShipmentStatusBadge,
  isReadyToDispatch,
  isStaleDispatch,
  shipmentMatchesView,
  type ViewableShipment, getStaleInTransitBadge, isStaleInTransit } from "@/lib/shipment-views";

const NOW = new Date("2026-09-08T15:00:00Z"); // 10:00 en Colombia

function shipment(overrides: Partial<ViewableShipment> = {}): ViewableShipment {
  return {
    status: ShippingStatus.Preparing,
    createdAt: new Date("2026-09-07T14:00:00Z"),
    updatedAt: new Date("2026-09-08T14:00:00Z"),
    firstEventAt: null,
    order: { status: OrderStatus.PAID, type: OrderType.STANDARD, paymentMethod: PaymentMethod.Bold },
    ...overrides,
  };
}

describe("shipment-views", () => {
  it("only paid or cash-on-delivery online orders are ready to dispatch", () => {
    expect(isReadyToDispatch(shipment())).toBe(true);
    expect(
      isReadyToDispatch(shipment({ order: { status: OrderStatus.PENDING, type: OrderType.STANDARD, paymentMethod: PaymentMethod.COD } })),
    ).toBe(true);
    expect(
      isReadyToDispatch(shipment({ order: { status: OrderStatus.PENDING, type: OrderType.STANDARD, paymentMethod: PaymentMethod.BankTransfer } })),
    ).toBe(false);
    expect(isReadyToDispatch(shipment({ order: { status: OrderStatus.CANCELLED, type: OrderType.STANDARD } }))).toBe(false);
    expect(isReadyToDispatch(shipment({ order: { status: OrderStatus.PAID, type: OrderType.POINT_OF_SALE } }))).toBe(false);
    expect(isReadyToDispatch(shipment({ status: ShippingStatus.Shipped }))).toBe(false);
  });

  it("leaves shipments older than the dispatch window out of the daily queue", () => {
    const old = shipment({ createdAt: new Date("2026-07-01T14:00:00Z") });
    expect(isStaleDispatch(old, NOW)).toBe(true);
    expect(isReadyToDispatch(old, NOW)).toBe(false);
    expect(shipmentMatchesView(old, "todos", NOW)).toBe(true);
    expect(isStaleDispatch(shipment({ status: ShippingStatus.Delivered, createdAt: new Date("2026-07-01T14:00:00Z") }), NOW)).toBe(false);
  });

  it("uses the first tracking event as dispatch date and falls back to the last update", () => {
    expect(getDispatchDate(shipment())).toBeNull();
    expect(getDispatchDate(shipment({ status: ShippingStatus.Cancelled }))).toBeNull();
    const first = new Date("2026-09-07T20:00:00Z");
    expect(getDispatchDate(shipment({ status: ShippingStatus.InTransit, firstEventAt: first }))).toBe(first);
    const updated = new Date("2026-09-08T12:00:00Z");
    expect(getDispatchDate(shipment({ status: ShippingStatus.Shipped, updatedAt: updated }))).toBe(updated);
    // Sin eventos, un estado posterior ya no dice cuándo salió el paquete.
    expect(getDispatchDate(shipment({ status: ShippingStatus.Delivered, updatedAt: updated }))).toBeNull();
  });

  it("assigns each shipment to its working view", () => {
    const list: ViewableShipment[] = [
      shipment(),
      shipment({ status: ShippingStatus.Shipped, updatedAt: new Date("2026-09-08T13:00:00Z") }),
      shipment({ status: ShippingStatus.InTransit, firstEventAt: new Date("2026-09-06T13:00:00Z") }),
      shipment({ status: ShippingStatus.FailedDelivery }),
      shipment({ status: ShippingStatus.Delivered }),
      shipment({ status: ShippingStatus.Cancelled }),
    ];
    const counts = countShipmentViews(list, NOW);
    expect(counts).toEqual({
      "por-despachar": 1,
      "despachados-hoy": 1,
      "en-camino": 2,
      "con-novedad": 1,
      entregados: 1,
      todos: 6,
    });
    expect(shipmentMatchesView(list[2], "despachados-hoy", NOW)).toBe(false);
  });

  it("labels statuses without emoji", () => {
    expect(getShipmentStatusBadge(ShippingStatus.OutForDelivery)).toEqual({ label: "En reparto", tone: "sky" });
    expect(getShipmentStatusBadge(ShippingStatus.Exception).tone).toBe("pink");
    expect(getShipmentStatusBadge(ShippingStatus.Delivered).label).not.toMatch(new RegExp("[^\\p{L}\\p{N} ]", "u"));
  });

  it("builds the picking list per order and per product", () => {
    const list = buildPickingList([
      {
        id: "s2",
        carrierName: "COORDINADORA",
        trackingCode: "ABC",
        order: {
          orderNumber: "ORD-2",
          fullName: "Ana",
          city: "Cali",
          orderItems: [
            { quantity: 2, product: { name: "Libreta", sku: "LIB-1" } },
            { quantity: 1, product: { name: "Lapicero", sku: "LAP-1" } },
          ],
        },
      },
      {
        id: "s1",
        courier: "Servientrega",
        order: {
          orderNumber: "ORD-1",
          fullName: "Luis",
          orderItems: [{ quantity: 3, product: { name: "Libreta", sku: "LIB-1" } }],
        },
      },
    ]);
    expect(list.orders.map((order) => order.orderNumber)).toEqual(["ORD-1", "ORD-2"]);
    expect(list.orders[0].carrier).toBe("Servientrega");
    expect(list.orders[1].units).toBe(3);
    expect(list.units).toBe(6);
    expect(list.totals).toEqual([
      { name: "Lapicero", sku: "LAP-1", quantity: 1, orders: 1 },
      { name: "Libreta", sku: "LIB-1", quantity: 5, orders: 2 },
    ]);
  });

  it("flags a guide in transit with no news for more than five days and lists it under con-novedad", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const stale = { status: ShippingStatus.InTransit, createdAt: days(9), updatedAt: days(6) };
    const fresh = { status: ShippingStatus.InTransit, createdAt: days(3), updatedAt: days(2) };
    const delivered = { status: ShippingStatus.Delivered, createdAt: days(20), updatedAt: days(10) };
    expect(isStaleInTransit(stale, now)).toBe(true);
    expect(isStaleInTransit(fresh, now)).toBe(false);
    expect(isStaleInTransit(delivered, now)).toBe(false);
    expect(getStaleInTransitBadge(stale, now)).toEqual({ label: "Sin novedades hace 6 días", tone: "pink" });
    expect(getStaleInTransitBadge(fresh, now)).toBeNull();
    expect(shipmentMatchesView({ ...stale, order: null }, "con-novedad", now)).toBe(true);
    expect(shipmentMatchesView({ ...fresh, order: null }, "con-novedad", now)).toBe(false);
  });
});
