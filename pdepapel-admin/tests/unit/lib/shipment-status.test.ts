import { describe, expect, it } from "vitest";

import { CLOSED_SHIPMENT_STATUSES, isShipmentTransitionAllowed, mapEnvioClickStatus } from "@/lib/shipment-status";
import { ShippingStatus } from "@prisma/client";

describe("mapEnvioClickStatus", () => {
  it("understands the English codes, the Spanish tracking texts and the webhook steps alike", () => {
    expect(mapEnvioClickStatus("DELIVERED", ShippingStatus.InTransit)).toBe(ShippingStatus.Delivered);
    expect(mapEnvioClickStatus("Entregado", ShippingStatus.InTransit)).toBe(ShippingStatus.Delivered);
    expect(mapEnvioClickStatus("Envío Recolectado", ShippingStatus.Shipped)).toBe(ShippingStatus.PickedUp);
    expect(mapEnvioClickStatus("En tránsito", ShippingStatus.Shipped)).toBe(ShippingStatus.InTransit);
    expect(mapEnvioClickStatus("WITH_DELIVERY_COURIER", ShippingStatus.InTransit)).toBe(ShippingStatus.OutForDelivery);
    expect(mapEnvioClickStatus("Intento de entrega fallido", ShippingStatus.OutForDelivery)).toBe(ShippingStatus.FailedDelivery);
    expect(mapEnvioClickStatus("Pendiente de Recolección", ShippingStatus.Preparing)).toBe(ShippingStatus.Preparing);
  });

  it("keeps the current status for an unknown value instead of inventing one", () => {
    expect(mapEnvioClickStatus("SOMETHING_NEW", ShippingStatus.InTransit)).toBe(ShippingStatus.InTransit);
    expect(mapEnvioClickStatus("", ShippingStatus.Shipped)).toBe(ShippingStatus.Shipped);
    expect(mapEnvioClickStatus(null, ShippingStatus.Shipped)).toBe(ShippingStatus.Shipped);
  });

  it("matches a longer description that contains a known text", () => {
    expect(mapEnvioClickStatus("Entregado a portería, recibió Juan", ShippingStatus.OutForDelivery)).toBe(ShippingStatus.Delivered);
    expect(mapEnvioClickStatus("En tránsito hacia la ciudad destino", ShippingStatus.PickedUp)).toBe(ShippingStatus.InTransit);
  });
});

describe("shipment transitions", () => {
  it("follows the shared table and never blocks a no-op", () => {
    expect(isShipmentTransitionAllowed(ShippingStatus.Preparing, ShippingStatus.Shipped)).toBe(true);
    expect(isShipmentTransitionAllowed(ShippingStatus.Delivered, ShippingStatus.Preparing)).toBe(false);
    expect(isShipmentTransitionAllowed(ShippingStatus.Delivered, ShippingStatus.Delivered)).toBe(true);
    expect(CLOSED_SHIPMENT_STATUSES).toEqual([ShippingStatus.Delivered, ShippingStatus.Cancelled]);
  });
});
