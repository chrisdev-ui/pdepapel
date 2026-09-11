import { describe, expect, it } from "vitest";

import {
  REVENUE_MARKETPLACE_ORDER_STATUSES,
  RETURN_MARKETPLACE_ORDER_STATUSES,
  getInventoryStatusMeta,
  getRawOrderStatusMeta,
  getSaleStatusMeta,
  isReturnMarketplaceOrderStatus,
  isRevenueMarketplaceOrderStatus,
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

  it("maps the inventory state to the action a person can take", () => {
    expect(getInventoryStatusMeta("EXCEPTION")).toMatchObject({ tone: "pink", action: "resync" });
    expect(getInventoryStatusMeta("RESTOCK_PENDING")).toMatchObject({ tone: "cream", action: "restock" });
    expect(getInventoryStatusMeta("DECREMENTED").action).toBeNull();
    expect(getInventoryStatusMeta("RESTOCKED").action).toBeNull();
    expect(getInventoryStatusMeta("whatever")).toMatchObject({ label: "Inventario pendiente de revisión", action: null });
  });

  it("labels the refund states and decides which states count as revenue", () => {
    expect(getSaleStatusMeta("PARTIALLY_REFUNDED")).toEqual({ label: "Reembolso parcial", variant: "warning" });
    expect(getSaleStatusMeta("REFUNDED")).toEqual({ label: "Reembolsada", variant: "destructive" });
    expect([...REVENUE_MARKETPLACE_ORDER_STATUSES]).toEqual(["PAID", "PARTIALLY_REFUNDED"]);
    expect([...RETURN_MARKETPLACE_ORDER_STATUSES]).toEqual(["CANCELLED", "REFUNDED"]);
    expect(isRevenueMarketplaceOrderStatus("REFUNDED")).toBe(false);
    expect(isRevenueMarketplaceOrderStatus("PENDING")).toBe(false);
    expect(isReturnMarketplaceOrderStatus("PARTIALLY_REFUNDED")).toBe(false);
  });
});
