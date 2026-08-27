import { PaymentMethod } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getAdminOrderPaymentOptions } from "@/lib/order-payment-options";

describe("getAdminOrderPaymentOptions", () => {
  it("shows each operational payment choice once for new orders", () => {
    const options = getAdminOrderPaymentOptions();

    expect(options.map((option) => option.value)).toEqual([
      PaymentMethod.Bold,
      PaymentMethod.BankTransfer,
      PaymentMethod.COD,
      PaymentMethod.CASH,
    ]);
    expect(
      options.filter((option) => option.label === "Pago en línea"),
    ).toHaveLength(1);
  });

  it.each([PaymentMethod.Wompi, PaymentMethod.PayU])(
    "preserves %s only for an existing historical order",
    (historicalMethod) => {
      const options = getAdminOrderPaymentOptions(historicalMethod);

      expect(options[0]).toMatchObject({
        value: historicalMethod,
        historical: true,
      });
      expect(
        options.filter((option) => option.value === historicalMethod),
      ).toHaveLength(1);
      expect(
        options.filter((option) => option.value === PaymentMethod.Bold),
      ).toHaveLength(1);
    },
  );
});
