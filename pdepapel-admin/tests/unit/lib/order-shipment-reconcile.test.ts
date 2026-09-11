import { describe, expect, it } from "vitest";

import { reconcileShipmentStatus } from "@/lib/order-transitions";
import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";

const standard = { type: OrderType.STANDARD, paymentMethod: PaymentMethod.BankTransfer };
const cod = { type: OrderType.STANDARD, paymentMethod: PaymentMethod.COD };

describe("reconcileShipmentStatus", () => {
  it("puts the shipment on its way when the order is marked as sent", () => {
    expect(
      reconcileShipmentStatus({ from: OrderStatus.PAID, to: OrderStatus.SENT, shippingStatus: ShippingStatus.Preparing, context: standard }),
    ).toEqual({ shippingStatus: ShippingStatus.Shipped });
    // El formulario reenvía el bloque de envío tal cual estaba («Preparando»).
    expect(
      reconcileShipmentStatus({
        from: OrderStatus.PAID,
        to: OrderStatus.SENT,
        shippingStatus: ShippingStatus.Preparing,
        requestedShippingStatus: ShippingStatus.Preparing,
        context: standard,
      }),
    ).toEqual({ shippingStatus: ShippingStatus.Shipped });
    // Sin envío guardado todavía: el upsert lo creará ya en camino.
    expect(reconcileShipmentStatus({ from: OrderStatus.PAID, to: OrderStatus.SENT, shippingStatus: null, context: standard })).toEqual({
      shippingStatus: ShippingStatus.Shipped,
    });
  });

  it("respects a shipment that is already moving or delivered", () => {
    expect(
      reconcileShipmentStatus({ from: OrderStatus.PAID, to: OrderStatus.SENT, shippingStatus: ShippingStatus.InTransit, context: standard }),
    ).toEqual({});
    expect(
      reconcileShipmentStatus({
        from: OrderStatus.PAID,
        to: OrderStatus.SENT,
        shippingStatus: ShippingStatus.Preparing,
        requestedShippingStatus: ShippingStatus.PickedUp,
        context: standard,
      }),
    ).toEqual({});
  });

  it("marks a paid order as sent when the shipment starts moving from the form", () => {
    expect(
      reconcileShipmentStatus({
        from: OrderStatus.PAID,
        shippingStatus: ShippingStatus.Preparing,
        requestedShippingStatus: ShippingStatus.Shipped,
        context: standard,
      }),
    ).toEqual({ status: OrderStatus.SENT });
    expect(
      reconcileShipmentStatus({ from: OrderStatus.PENDING, shippingStatus: ShippingStatus.Preparing, requestedShippingStatus: ShippingStatus.Shipped, context: cod }),
    ).toEqual({ status: OrderStatus.SENT });
  });

  it("never forces a transition the order does not allow", () => {
    // Transferencia sin pagar: despachar no lo convierte en enviado.
    expect(
      reconcileShipmentStatus({ from: OrderStatus.PENDING, shippingStatus: ShippingStatus.Preparing, requestedShippingStatus: ShippingStatus.Shipped, context: standard }),
    ).toEqual({});
    // Ya enviado: nada que hacer.
    expect(
      reconcileShipmentStatus({ from: OrderStatus.SENT, shippingStatus: ShippingStatus.Shipped, requestedShippingStatus: ShippingStatus.Delivered, context: standard }),
    ).toEqual({});
    // Estado del envío sin cambios: no dispara nada.
    expect(
      reconcileShipmentStatus({ from: OrderStatus.PAID, shippingStatus: ShippingStatus.Shipped, requestedShippingStatus: ShippingStatus.Shipped, context: standard }),
    ).toEqual({});
  });

  it("leaves an explicit order status change alone except for the shipment", () => {
    expect(
      reconcileShipmentStatus({ from: OrderStatus.PAID, to: OrderStatus.CANCELLED, shippingStatus: ShippingStatus.Preparing, context: standard }),
    ).toEqual({});
    expect(
      reconcileShipmentStatus({ from: OrderStatus.PENDING, to: OrderStatus.PAID, shippingStatus: ShippingStatus.Preparing, context: standard }),
    ).toEqual({});
  });
});
