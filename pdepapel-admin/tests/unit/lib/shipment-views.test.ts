import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildPickingList,
  countShipmentViews,
  formatShortDate,
  getDispatchDate,
  getShipmentProviderLabel,
  getShipmentStatusBadge,
  getStaleInTransitBadge,
  isReadyToDispatch,
  isStaleDispatch,
  isStaleInTransit,
  pickingTargets,
  resolvePickingItemIdentity,
  shipmentMatchesView,
  type PickingSourceShipment,
  type ViewableShipment,
} from "@/lib/shipment-views";
import { ShippingProvider } from "@prisma/client";

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
  it("labels the guide origin in Spanish, including pickup at the store", () => {
    expect(getShipmentProviderLabel(ShippingProvider.ENVIOCLICK)).toBe("EnvioClick");
    expect(getShipmentProviderLabel(ShippingProvider.MANUAL)).toBe("Manual");
    expect(getShipmentProviderLabel(ShippingProvider.NONE)).toBe("Recoge en tienda");
  });

  it("formats the arrival date in Bogotá time and tolerates missing values", () => {
    // 04:00Z es aún el día anterior en Colombia.
    expect(formatShortDate(new Date("2026-09-15T04:00:00Z"))).toBe(formatShortDate("2026-09-14T20:00:00Z"));
    expect(formatShortDate(null)).toBeNull();
    expect(formatShortDate("no-es-fecha")).toBeNull();
  });

  it("names a line from the order snapshot, then the product, and never calls a manual item deleted", () => {
    expect(resolvePickingItemIdentity({ quantity: 1, name: "Washi floral", sku: "WF-1", productId: "p1", product: { name: "Washi (nuevo)", sku: "WF-2" } })).toEqual({ name: "Washi floral", sku: "WF-1" });
    expect(resolvePickingItemIdentity({ quantity: 1, name: "", sku: "", productId: "p1", product: { name: "Washi", sku: "WF-2" } })).toEqual({ name: "Washi", sku: "WF-2" });
    expect(resolvePickingItemIdentity({ quantity: 1, name: "", sku: "", productId: null, product: null })).toEqual({ name: "Ítem manual", sku: null });
    expect(resolvePickingItemIdentity({ quantity: 1, name: "Grabado láser", sku: null, productId: null, product: null })).toEqual({ name: "Grabado láser", sku: null });
    expect(resolvePickingItemIdentity({ quantity: 1, name: "", productId: "p-gone", product: null })).toEqual({ name: "Producto eliminado", sku: null });
  });

  it("keeps manual items apart and counts distinct orders in the shelf totals", () => {
    const list = buildPickingList([
      {
        id: "s1",
        order: {
          orderNumber: "ORD-1",
          fullName: "Luis",
          orderItems: [
            { quantity: 1, name: "Grabado nombre", sku: "", productId: null, product: null },
            { quantity: 1, name: "Lazo rojo", sku: "", productId: null, product: null },
            { quantity: 2, name: "Libreta", sku: "LIB-1", productId: "p-lib", product: { name: "Libreta", sku: "LIB-1" } },
            { quantity: 1, name: "Libreta", sku: "LIB-1", productId: "p-lib", product: { name: "Libreta", sku: "LIB-1" } },
          ],
        },
      },
    ]);
    expect(list.orders[0].items.map((item) => item.name)).toEqual(["Grabado nombre", "Lazo rojo", "Libreta", "Libreta"]);
    expect(list.totals).toEqual([
      { name: "Grabado nombre", sku: null, quantity: 1, orders: 1 },
      { name: "Lazo rojo", sku: null, quantity: 1, orders: 1 },
      { name: "Libreta", sku: "LIB-1", quantity: 3, orders: 1 },
    ]);
    expect(list.units).toBe(5);
  });

  it("explodes kits into components on the shelf list but keeps the kit line per order", () => {
    const kit: PickingSourceShipment["order"]["orderItems"][number] = {
      quantity: 2,
      name: "Kit escritorio",
      sku: "KIT-1",
      productId: "p-kit",
      product: {
        name: "Kit escritorio",
        sku: "KIT-1",
        isKit: true,
        kitComponents: [
          { quantity: 2, component: { id: "p-washi", name: "Washi tape", sku: "WT-1" } },
          { quantity: 1, component: { id: "p-lap", name: "Lapicero", sku: "LAP-1" } },
        ],
      },
    };
    const list = buildPickingList([
      { id: "s1", order: { orderNumber: "ORD-1", fullName: "Ana", orderItems: [kit] } },
      {
        id: "s2",
        order: {
          orderNumber: "ORD-2",
          fullName: "Luis",
          orderItems: [{ quantity: 1, name: "Lapicero", sku: "LAP-1", productId: "p-lap", product: { name: "Lapicero", sku: "LAP-1", isKit: false, kitComponents: [] } }],
        },
      },
    ]);
    expect(list.orders[0].items).toEqual([
      {
        name: "Kit escritorio",
        sku: "KIT-1",
        quantity: 2,
        components: [
          { name: "Washi tape", sku: "WT-1", quantity: 4 },
          { name: "Lapicero", sku: "LAP-1", quantity: 2 },
        ],
      },
    ]);
    expect(list.orders[0].units).toBe(2);
    expect(list.totals).toEqual([
      { name: "Lapicero", sku: "LAP-1", quantity: 3, orders: 2 },
      { name: "Washi tape", sku: "WT-1", quantity: 4, orders: 1 },
    ]);
    expect(list.totals.some((total) => total.name === "Kit escritorio")).toBe(false);
  });

  it("narrows the picking targets to the selection without leaving the dispatch queue", () => {
    const dispatch = [{ id: "s1" }, { id: "s2" }];
    expect(pickingTargets(dispatch)).toEqual(dispatch);
    expect(pickingTargets(dispatch, ["s2", "s9"])).toEqual([{ id: "s2" }]);
    expect(pickingTargets(dispatch, [])).toEqual([]);
  });

  it("makes the picking button count exactly what the por-despachar tab shows", () => {
    type Fixture = ViewableShipment & { id: string };
    const fixture: Fixture[] = [
      { id: "paid", ...shipment() },
      { id: "cod", ...shipment({ order: { status: OrderStatus.PENDING, type: OrderType.STANDARD, paymentMethod: PaymentMethod.COD } }) },
      // La consulta anterior traía estos por estar PENDING/CREATED; la pestaña no.
      { id: "pending-transfer", ...shipment({ order: { status: OrderStatus.PENDING, type: OrderType.STANDARD, paymentMethod: PaymentMethod.BankTransfer } }) },
      { id: "created-bold", ...shipment({ order: { status: OrderStatus.CREATED, type: OrderType.STANDARD, paymentMethod: PaymentMethod.Bold } }) },
      { id: "old", ...shipment({ createdAt: new Date("2026-07-01T14:00:00Z") }) },
      { id: "pos", ...shipment({ order: { status: OrderStatus.PAID, type: OrderType.POINT_OF_SALE } }) },
      { id: "shipped", ...shipment({ status: ShippingStatus.Shipped }) },
    ];
    // Lo que carga `getDispatchQueue` tras filtrar con la misma regla.
    const dispatch = fixture.filter((entry) => isReadyToDispatch(entry, NOW));
    const tab = countShipmentViews(fixture, NOW)["por-despachar"];
    expect(dispatch.map((entry) => entry.id)).toEqual(["paid", "cod"]);
    expect(pickingTargets(dispatch)).toHaveLength(tab);
    const activeViewIds = fixture.filter((entry) => shipmentMatchesView(entry, "todos", NOW)).map((entry) => entry.id);
    expect(pickingTargets(dispatch, activeViewIds)).toHaveLength(tab);
    const inTransitIds = fixture.filter((entry) => shipmentMatchesView(entry, "en-camino", NOW)).map((entry) => entry.id);
    expect(pickingTargets(dispatch, inTransitIds)).toHaveLength(0);
  });
});
