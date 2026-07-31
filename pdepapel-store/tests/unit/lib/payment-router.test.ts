import { PaymentMethod } from "@/constants";
import {
  DEFAULT_PAYMENT_ROUTING,
  resolvePaymentGateway,
} from "@/lib/payment-router";
import { describe, expect, it } from "vitest";

describe("payment routing", () => {
  it("keeps Bold as the primary online option and Wompi as fallback", () => {
    expect(DEFAULT_PAYMENT_ROUTING).toMatchObject({
      primaryOnlineGateway: PaymentMethod.Bold,
      secondaryOnlineGateway: PaymentMethod.Wompi,
    });
    expect(resolvePaymentGateway(PaymentMethod.Bold)).toEqual({
      activeMethod: PaymentMethod.Bold,
      isOnline: true,
      fallbackMethod: PaymentMethod.Wompi,
    });
  });

  it("routes Wompi online payments back to Bold as fallback", () => {
    expect(resolvePaymentGateway(PaymentMethod.Wompi)).toEqual({
      activeMethod: PaymentMethod.Wompi,
      isOnline: true,
      fallbackMethod: PaymentMethod.Bold,
    });
  });

  it("does not mark bank transfers as online payments", () => {
    expect(resolvePaymentGateway()).toEqual({
      activeMethod: PaymentMethod.BankTransfer,
      isOnline: false,
    });
  });
});
