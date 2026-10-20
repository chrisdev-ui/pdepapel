/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isCashOnDelivery,
  isPaymentReturn,
  rememberPaymentNotice,
  resolvePaymentResult,
  wasPaymentNoticeShown,
} from "@/lib/payment-return";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("regreso desde la pasarela", () => {
  it.each([
    ["?id=123-abc&env=test", true],
    ["?bold-order-id=ORD-1&bold-tx-status=approved", true],
    ["?bold-tx-status=rejected", true],
    ["?bold-order-id=ORD-1", true],
    ["", false],
    ["?autoPay=true", false],
    ["?id=", false],
    ["?utm_source=whatsapp", false],
  ])("%s → %s", (query, expected) => {
    expect(isPaymentReturn(new URLSearchParams(query))).toBe(expected);
  });

  it("el resultado lo da la administración; sin él se deduce del estado", () => {
    expect(resolvePaymentResult({ status: "CREATED", paymentResult: "approved" })).toBe("approved");
    expect(resolvePaymentResult({ status: "PAID" })).toBe("approved");
    expect(resolvePaymentResult({ status: "CANCELLED" })).toBe("declined");
    expect(resolvePaymentResult({ status: "REJECTED" })).toBe("declined");
    expect(resolvePaymentResult({ status: "PENDING" })).toBe("pending");
    expect(resolvePaymentResult({ status: "CREATED" })).toBe("pending");
  });

  it("contra entrega se reconoce por el método", () => {
    expect(isCashOnDelivery({ payment: { id: "p", method: "COD" } })).toBe(true);
    expect(isCashOnDelivery({ payment: { id: "p", method: "Bold" } })).toBe(false);
  });

  it("el aviso se recuerda por pedido y por resultado", () => {
    expect(wasPaymentNoticeShown("o-1", "approved")).toBe(false);
    rememberPaymentNotice("o-1", "approved");
    expect(wasPaymentNoticeShown("o-1", "approved")).toBe(true);
    expect(wasPaymentNoticeShown("o-1", "declined")).toBe(false);
    expect(wasPaymentNoticeShown("o-2", "approved")).toBe(false);
  });

  it("sin almacenamiento no revienta", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => rememberPaymentNotice("o-1", "approved")).not.toThrow();
    expect(wasPaymentNoticeShown("o-1", "approved")).toBe(false);
  });
});
