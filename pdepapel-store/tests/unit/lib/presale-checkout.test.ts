import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PaymentMethod } from "@/constants";
import { PREORDER_TERMS_VERSION } from "@/lib/legal-versions";
import {
  amountDueNow,
  applyDepositCheckout,
  DEPOSIT_PAYMENT_METHODS,
  depositBalance,
  resolveCheckoutEndpoint,
} from "@/lib/presale-checkout";
import { DEPOSIT_SHIPPING_LABEL } from "@/lib/presale-copy";
import type { CheckoutOrder } from "@/types";

const repo = path.resolve(__dirname, "../../../..");

const payload = (overrides: Partial<CheckoutOrder> = {}): CheckoutOrder => ({
  fullName: "Ana Pérez",
  phone: "+573001234567",
  email: "ana@prueba.test",
  address: "Calle 1 # 2-3",
  city: "Medellín",
  department: "Antioquia",
  daneCode: "05001000",
  userId: null,
  guestId: "g-1",
  couponCode: "HOLA",
  giftCardCode: "PDP-AAAA-BBBB",
  subtotal: 160000,
  total: 178000,
  orderItems: [{ productId: "cal", quantity: 1 }],
  payment: { method: PaymentMethod.Bold },
  shipping: { carrierName: "ENVIA", cost: 18000, flete: 18000, isCOD: true },
  shippingProvider: "ENVIOCLICK",
  shippingOptionType: "PRESALE_DEPOSIT",
  envioClickIdRate: 77,
  ...overrides,
});

describe("pedido de una preventa con anticipo", () => {
  it("manda la casilla y su versión, envío manual en 0 y total = subtotal, sin cupón ni tarjeta", () => {
    const data = applyDepositCheckout(payload());
    expect(data.preorderTermsAccepted).toBe(true);
    expect(data.preorderTermsVersion).toBe("2026-10-28");
    expect(data.preorderTermsVersion).toBe(PREORDER_TERMS_VERSION);
    expect(data.couponCode).toBeNull();
    expect(data.giftCardCode).toBeNull();
    expect(data.total).toBe(160000);
    expect(data.subtotal).toBe(160000);
    expect(data.envioClickIdRate).toBe(0);
    expect(data.shipping).toMatchObject({ provider: "CUSTOM", cost: 0, carrierName: DEPOSIT_SHIPPING_LABEL, isCOD: false });
    // Lo demás viaja igual.
    expect(data.orderItems).toEqual([{ productId: "cal", quantity: 1 }]);
    expect(data.payment.method).toBe(PaymentMethod.Bold);
  });

  it("la etiqueta del envío es la misma que pone el panel", () => {
    const presale = readFileSync(path.join(repo, "pdepapel-admin/lib/presale.ts"), "utf8");
    expect(presale).toContain(`export const DEPOSIT_PRESALE_SHIPPING_LABEL = "${DEPOSIT_SHIPPING_LABEL}";`);
  });

  it("se paga en línea o por transferencia; nunca contra entrega", () => {
    expect(DEPOSIT_PAYMENT_METHODS).toEqual([PaymentMethod.Bold, PaymentMethod.Wompi, PaymentMethod.BankTransfer]);
    expect(DEPOSIT_PAYMENT_METHODS).not.toContain(PaymentMethod.COD);
  });

  it("la transferencia de una reserva va a /checkout (POST /orders no sabe de anticipos)", () => {
    expect(resolveCheckoutEndpoint({ payment: { method: PaymentMethod.BankTransfer }, preorderTermsAccepted: true })).toBe("checkout");
    expect(resolveCheckoutEndpoint({ payment: { method: PaymentMethod.Bold }, preorderTermsAccepted: true })).toBe("checkout");
    expect(resolveCheckoutEndpoint({ payment: { method: PaymentMethod.BankTransfer } })).toBe("orders");
    expect(resolveCheckoutEndpoint({ payment: { method: PaymentMethod.COD } })).toBe("orders");
    expect(resolveCheckoutEndpoint({ payment: { method: PaymentMethod.Wompi } })).toBe("checkout");
  });
});

describe("lo que se paga ahora (transferencia)", () => {
  it("una reserva pendiente: el anticipo", () => {
    expect(amountDueNow({ status: "PENDING", total: 160000, paymentPlan: "DEPOSIT", depositAmount: 30000, giftCardAmount: 0 })).toBe(30000);
  });

  it("un pedido normal: el total menos la tarjeta de regalo (antes mostraba el total)", () => {
    expect(amountDueNow({ status: "PENDING", total: 100000, paymentPlan: "FULL", depositAmount: null, giftCardAmount: 40000 })).toBe(60000);
    expect(amountDueNow({ status: "PENDING", total: 100000, giftCardAmount: undefined } as never)).toBe(100000);
  });

  it("con el anticipo ya recibido no se vuelve a pedir el anticipo", () => {
    expect(amountDueNow({ status: "DEPOSIT_PAID", total: 160000, paymentPlan: "DEPOSIT", depositAmount: 30000, giftCardAmount: 0 })).toBe(160000);
  });

  it("el saldo es el total menos el anticipo", () => {
    expect(depositBalance({ total: 160000, depositAmount: 30000 })).toBe(130000);
  });
});
