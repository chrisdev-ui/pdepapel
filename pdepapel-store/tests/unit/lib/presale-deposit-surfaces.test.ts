import { describe, expect, it } from "vitest";

import { OrderStatus, PaymentMethod } from "@/constants";
import { getOrderStage, getOrderTimeline, isAwaitingPayment } from "@/lib/order-status";
import { shouldPollOrderStatus } from "@/lib/order-status-polling";
import { resolvePaymentResult } from "@/lib/payment-return";
import { getProductAvailability } from "@/lib/product-availability";
import { getProductCardBadges } from "@/lib/product-card";
import { buildProductSchema } from "@/lib/product-schema";
import { getPurchasableUnits } from "@/lib/purchasable-units";
import type { Order, Product } from "@/types";

const presale = (overrides: Record<string, unknown> = {}) => ({
  id: "ps",
  expectedArrivalAt: null,
  expectedArrivalText: null,
  unitLimit: null,
  committedUnits: 7,
  paymentMode: "DEPOSIT",
  depositType: "FIXED",
  depositValue: 30000,
  termsText: null,
  ...overrides,
});

const product = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "cal",
    slug: "calendario",
    name: "Calendario de adviento",
    description: "",
    price: 160000,
    stock: 0,
    isArchived: false,
    availableAt: null,
    isGroup: false,
    images: [],
    reviews: [],
    presales: [presale()],
    ...overrides,
  }) as unknown as Product;

describe("preventa sin tope de campaña", () => {
  it("cada pedido lleva hasta 5, aunque la bodega esté en cero", () => {
    expect(getPurchasableUnits(product())).toBe(5);
    expect(getPurchasableUnits(product({ presales: [presale({ committedUnits: 900 })] }))).toBe(5);
  });

  it("con tope, sigue mandando lo que queda del cupo", () => {
    expect(getPurchasableUnits(product({ presales: [presale({ unitLimit: 10, committedUnits: 7 })] }))).toBe(3);
  });

  it("la tarjeta dice «Preventa» y nunca «Reservas agotadas» por un tope que no existe", () => {
    expect(getProductCardBadges(product()).commercial).toEqual({ text: "Preventa", tone: "comingSoon" });
  });

  it("una preventa completa con fecha conserva «Preventa · llega el …»", () => {
    const full = product({ presales: [presale({ paymentMode: "FULL", unitLimit: 40, expectedArrivalAt: "2026-12-05T17:00:00.000Z" })] });
    expect(getProductCardBadges(full).commercial?.text).toMatch(/^Preventa · llega el 5 de dic/);
  });
});

describe("ficha de una preventa con anticipo", () => {
  it("botón «Reservar con anticipo», sin «quedan N» y con la fecha por confirmar", () => {
    const result = getProductAvailability(product());
    expect(result).toMatchObject({ status: "presale", canBuy: true, ctaLabel: "Reservar con anticipo" });
    expect(result.presale).toMatchObject({ deposit: true, uncapped: true, arrivalLabel: null, arrivalLine: "Fecha estimada: por confirmar" });
    expect(result.stockLabel).toBe("Preventa · Fecha estimada: por confirmar");
  });

  it("con texto o con fecha, la misma línea que el panel", () => {
    expect(getProductAvailability(product({ presales: [presale({ expectedArrivalText: "primera semana de diciembre" })] })).presale?.arrivalLine).toBe(
      "Fecha estimada: primera semana de diciembre",
    );
    expect(getProductAvailability(product({ presales: [presale({ expectedArrivalAt: "2026-12-05T17:00:00.000Z" })] })).presale?.arrivalLine).toBe(
      "Fecha estimada: 5 de diciembre",
    );
  });

  it("una preventa completa sigue con «Reservar ahora»", () => {
    expect(getProductAvailability(product({ presales: [presale({ paymentMode: "FULL" })] })).ctaLabel).toBe("Reservar ahora");
  });
});

describe("datos estructurados de una preventa", () => {
  it("sin fecha no hay availabilityStarts (un texto no es una fecha)", () => {
    const schema = buildProductSchema(product()) as Record<string, any>;
    expect(schema.offers.availability).toBe("https://schema.org/PreOrder");
    expect(schema.offers).not.toHaveProperty("availabilityStarts");
  });

  it("con fecha, availabilityStarts es esa fecha", () => {
    const schema = buildProductSchema(product({ presales: [presale({ expectedArrivalAt: "2026-12-05T17:00:00.000Z" })] })) as Record<string, any>;
    expect(schema.offers.availabilityStarts).toBe("2026-12-05T17:00:00.000Z");
  });
});

const order = (overrides: Partial<Order> = {}) =>
  ({
    id: "o",
    orderNumber: "ORD-1",
    status: OrderStatus.DEPOSIT_PAID,
    createdAt: "2026-10-28T10:00:00.000Z",
    paidAt: null,
    depositPaidAt: "2026-10-28T10:05:00.000Z",
    paymentPlan: "DEPOSIT",
    depositAmount: 30000,
    total: 160000,
    payment: { id: "p", method: PaymentMethod.BankTransfer },
    shipping: { provider: "MANUAL", status: "Preparing" },
    orderItems: [],
    ...overrides,
  }) as unknown as Order;

describe("pedido con el anticipo recibido", () => {
  it("el regreso de la pasarela es un pago aprobado", () => {
    expect(resolvePaymentResult({ status: OrderStatus.DEPOSIT_PAID })).toBe("approved");
  });

  it("deja de sondear: no hay nada más que confirmar en esta visita", () => {
    expect(shouldPollOrderStatus(OrderStatus.DEPOSIT_PAID, true)).toBe(false);
    expect(shouldPollOrderStatus(OrderStatus.PENDING, true)).toBe(true);
  });

  it("«Anticipo recibido», sin «Pagar ahora» aunque haya sido por transferencia", () => {
    for (const method of [PaymentMethod.BankTransfer, PaymentMethod.Bold, PaymentMethod.Wompi]) {
      const value = order({ payment: { id: "p", method } });
      expect(getOrderStage(value)).toMatchObject({ stage: "deposit_paid", label: "Anticipo recibido", tone: "success" });
      expect(isAwaitingPayment(value)).toBe(false);
    }
  });

  it("la línea de tiempo marca el anticipo y deja el envío pendiente", () => {
    const steps = getOrderTimeline(order());
    expect(steps.find((step) => step.id === "paid")).toMatchObject({
      label: "Anticipo recibido",
      state: "done",
      date: "2026-10-28T10:05:00.000Z",
    });
    expect(steps.find((step) => step.id === "shipped")).toMatchObject({ state: "pending", detail: "Sale cuando llegue la preventa" });
  });

  it("una reserva pendiente sigue esperando el pago", () => {
    expect(isAwaitingPayment(order({ status: OrderStatus.PENDING, depositPaidAt: null }))).toBe(true);
  });
});
