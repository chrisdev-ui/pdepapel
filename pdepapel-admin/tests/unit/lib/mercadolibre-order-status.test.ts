import { describe, expect, it } from "vitest";

import {
  getRawOrderStatusMeta,
  getSaleStatusMeta,
} from "@/lib/mercadolibre/order-status";

describe("getSaleStatusMeta", () => {
  it("maps every MarketplaceOrderStatus value to a Spanish label and badge color", () => {
    expect(getSaleStatusMeta("PENDING")).toEqual({
      label: "Pendiente de pago",
      variant: "warning",
    });
    expect(getSaleStatusMeta("PAID")).toEqual({
      label: "Pagada",
      variant: "success",
    });
    expect(getSaleStatusMeta("SHIPPED")).toEqual({
      label: "Enviada",
      variant: "info",
    });
    expect(getSaleStatusMeta("DELIVERED")).toEqual({
      label: "Entregada",
      variant: "success",
    });
    expect(getSaleStatusMeta("CANCELLED")).toEqual({
      label: "Cancelada",
      variant: "destructive",
    });
    expect(getSaleStatusMeta("RETURN_PENDING")).toEqual({
      label: "Devolución en proceso",
      variant: "warning",
    });
    expect(getSaleStatusMeta("RETURNED")).toEqual({
      label: "Devuelta",
      variant: "destructive",
    });
  });

  it("never renders a raw enum value: unknown statuses degrade gracefully", () => {
    expect(getSaleStatusMeta("SOMETHING_NEW")).toEqual({
      label: "Estado pendiente de revisión",
      variant: "secondary",
    });
  });
});

describe("getRawOrderStatusMeta", () => {
  it("maps common Mercado Libre order statuses to Spanish + color", () => {
    expect(getRawOrderStatusMeta("paid")).toEqual({
      label: "Pagada",
      variant: "success",
    });
    expect(getRawOrderStatusMeta("payment_in_process")).toEqual({
      label: "Pago en proceso",
      variant: "warning",
    });
    expect(getRawOrderStatusMeta("payment_review")).toEqual({
      label: "Pago en revisión",
      variant: "warning",
    });
    expect(getRawOrderStatusMeta("cancelled")).toEqual({
      label: "Cancelada",
      variant: "destructive",
    });
  });

  it("is case-insensitive for the raw status", () => {
    expect(getRawOrderStatusMeta("PAID").label).toBe("Pagada");
  });

  it("never renders an unknown raw Mercado Libre status", () => {
    expect(getRawOrderStatusMeta("unrecognized_status")).toEqual({
      label: "Estado pendiente de revisión",
      variant: "secondary",
    });
  });
});
