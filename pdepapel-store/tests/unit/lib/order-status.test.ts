import { describe, expect, it } from "vitest";

import { OrderStatus, PaymentMethod, ShippingStatus } from "@/constants";
import {
  countOrderUnits,
  formatUnits,
  getOrderStage,
  getOrderSupportWhatsAppUrl,
  getOrderTimeline,
  getPaymentMethodLabel,
  getShippingStatusLabel,
  getTrackingUrl,
  isAwaitingPayment,
  SHIPPING_STATUS_LABELS,
} from "@/lib/order-status";

const base = {
  status: OrderStatus.PAID,
  createdAt: "2026-09-09T20:14:00.000Z",
  paidAt: "2026-09-09T20:16:00.000Z",
  payment: { method: PaymentMethod.Bold },
  shipping: {
    status: ShippingStatus.Preparing,
    provider: "ENVIOCLICK" as const,
    createdAt: "2026-09-09T20:14:00.000Z",
    updatedAt: "2026-09-10T11:15:00.000Z",
  },
};

describe("getOrderStage", () => {
  it("maps an unpaid online order to 'Por pagar'", () => {
    const stage = getOrderStage({ ...base, status: OrderStatus.CREATED });
    expect(stage.stage).toBe("unpaid");
    expect(stage.label).toBe("Por pagar");
  });

  it("names a bank transfer as pending verification, even while CREATED", () => {
    const stage = getOrderStage({
      ...base,
      status: OrderStatus.CREATED,
      payment: { method: PaymentMethod.BankTransfer },
    });
    expect(stage.stage).toBe("verifying");
    expect(stage.label).toBe("Transferencia por verificar");
  });

  it("treats cash on delivery as its own stage", () => {
    const stage = getOrderStage({
      ...base,
      status: OrderStatus.CREATED,
      payment: { method: PaymentMethod.COD },
    });
    expect(stage.stage).toBe("cod");
    expect(isAwaitingPayment({ ...base, status: OrderStatus.CREATED, payment: { method: PaymentMethod.COD } })).toBe(false);
  });

  it("follows the carrier once the order is paid", () => {
    expect(getOrderStage(base).stage).toBe("paid");
    expect(
      getOrderStage({ ...base, shipping: { ...base.shipping, status: ShippingStatus.OutForDelivery } }).stage,
    ).toBe("shipped");
    expect(
      getOrderStage({ ...base, shipping: { ...base.shipping, status: ShippingStatus.Delivered } }).stage,
    ).toBe("delivered");
  });

  it("surfaces unhappy carrier states instead of painting them green", () => {
    for (const status of [ShippingStatus.FailedDelivery, ShippingStatus.Exception, ShippingStatus.Cancelled]) {
      const stage = getOrderStage({ ...base, shipping: { ...base.shipping, status } });
      expect(stage.stage).toBe("issue");
      expect(stage.tone).toBe("danger");
    }
    expect(
      getOrderStage({ ...base, shipping: { ...base.shipping, status: ShippingStatus.Returned } }).label,
    ).toBe("Devuelto");
  });

  it("does not thank the customer for a cancelled order", () => {
    const stage = getOrderStage({ ...base, status: OrderStatus.CANCELLED });
    expect(stage.stage).toBe("cancelled");
    expect(stage.tone).toBe("neutral");
  });

  it("never throws on an unknown status", () => {
    expect(() => getOrderStage({ ...base, status: "WHATEVER" })).not.toThrow();
    expect(getOrderStage({ status: "WHATEVER" }).stage).toBe("unpaid");
  });
});

describe("shipping labels", () => {
  it("covers every carrier status with Spanish copy", () => {
    for (const status of Object.values(ShippingStatus)) {
      expect(SHIPPING_STATUS_LABELS[status]).toBeTruthy();
      expect(getShippingStatusLabel(status)).not.toBe("");
    }
  });

  it("falls back gracefully", () => {
    expect(getShippingStatusLabel(undefined)).toBe("En preparación");
    expect(getShippingStatusLabel("Weird")).toBe("Weird");
  });
});

describe("getOrderTimeline", () => {
  it("prints the creation date only on the first step of an unpaid order", () => {
    const steps = getOrderTimeline({ ...base, status: OrderStatus.CREATED, paidAt: null });
    expect(steps.map((step) => step.state)).toEqual(["done", "current", "pending", "pending"]);
    expect(steps[0].date).toBe(base.createdAt);
    expect(steps[1].date).toBeNull();
    expect(steps[2].date).toBeNull();
  });

  it("uses paidAt for the payment step and the shipping update for the shipped step", () => {
    const steps = getOrderTimeline({
      ...base,
      shipping: { ...base.shipping, status: ShippingStatus.InTransit, trackingCode: "970" },
    });
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done", "current"]);
    expect(steps[1].date).toBe(base.paidAt);
    expect(steps[2].date).toBe(base.shipping.updatedAt);
    expect(steps[2].detail).toBe("En tránsito");
  });

  it("marks an issue on the shipping step", () => {
    const steps = getOrderTimeline({
      ...base,
      shipping: { ...base.shipping, status: ShippingStatus.FailedDelivery },
    });
    expect(steps[2].state).toBe("issue");
    expect(steps[2].detail).toBe("Intento de entrega fallido");
  });

  it("completes every step when delivered and clears them when cancelled", () => {
    expect(
      getOrderTimeline({ ...base, shipping: { ...base.shipping, status: ShippingStatus.Delivered } }).every(
        (step) => step.state === "done",
      ),
    ).toBe(true);
    const cancelled = getOrderTimeline({ ...base, status: OrderStatus.CANCELLED });
    expect(cancelled.map((step) => step.state)).toEqual(["done", "pending", "pending", "pending"]);
  });

  it("labels pickup orders as ready to collect", () => {
    const steps = getOrderTimeline({ ...base, shipping: { ...base.shipping, provider: "NONE" } });
    expect(steps[2].label).toBe("Listo para retirar");
    expect(steps[3].label).toBe("Retirado");
  });
});

describe("getTrackingUrl", () => {
  it("returns null instead of '#' when there is nothing to link", () => {
    expect(getTrackingUrl(undefined)).toBeNull();
    expect(getTrackingUrl({ provider: "MANUAL", trackingCode: "", trackingUrl: "https://x.co" })).toBeNull();
    expect(getTrackingUrl({ provider: "MANUAL", trackingCode: "123" })).toBeNull();
  });

  it("builds the EnvioClick page and accepts only http(s) manual URLs", () => {
    expect(getTrackingUrl({ provider: "ENVIOCLICK", trackingCode: "97 0" })).toBe(
      "https://www.envioclick.com/co/track/97%200",
    );
    expect(
      getTrackingUrl({ provider: "MANUAL", trackingCode: "1", trackingUrl: "https://coordinadora.com/g/1" }),
    ).toBe("https://coordinadora.com/g/1");
    expect(getTrackingUrl({ provider: "MANUAL", trackingCode: "1", trackingUrl: "javascript:alert(1)" })).toBeNull();
  });
});

describe("helpers", () => {
  it("labels payment methods provider-neutrally", () => {
    expect(getPaymentMethodLabel(PaymentMethod.Bold)).toBe("Pago en línea");
    expect(getPaymentMethodLabel(PaymentMethod.PayU)).toBe("Pago en línea");
    expect(getPaymentMethodLabel(PaymentMethod.COD)).toBe("Pago contra entrega");
    expect(getPaymentMethodLabel(undefined)).toBe("Pago en línea");
  });

  it("counts units and pluralises", () => {
    expect(countOrderUnits({ orderItems: [{ quantity: 2 }, { quantity: 1 }] } as never)).toBe(3);
    expect(formatUnits(1)).toBe("1 producto");
    expect(formatUnits(3)).toBe("3 productos");
  });

  it("prefills the WhatsApp message with the order number", () => {
    const url = getOrderSupportWhatsAppUrl("ORD-1");
    expect(url.startsWith("https://wa.me/573132582293?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("ORD-1");
  });
});
