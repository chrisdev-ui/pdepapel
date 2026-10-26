import { describe, expect, it } from "vitest";

import { missingBankTransferFields, parseBankTransfer } from "@/lib/bank-transfer";

describe("parseBankTransfer", () => {
  it("toma solo textos con contenido y un WhatsApp con indicativo", () => {
    expect(parseBankTransfer({ account: " Ahorros 000 ", breBKey: "@llave", whatsappNumber: "573000000000" })).toEqual({
      account: "Ahorros 000",
      breBKey: "@llave",
      whatsappNumber: "573000000000",
    });
    expect(parseBankTransfer({ account: "", breBKey: 12, whatsappNumber: "3000000000" })).toEqual({ account: null, breBKey: null, whatsappNumber: null });
    expect(parseBankTransfer(undefined)).toEqual({ account: null, breBKey: null, whatsappNumber: null });
  });

  it("dice qué falta", () => {
    expect(missingBankTransferFields({ account: "a", breBKey: null, whatsappNumber: null })).toEqual(["breBKey", "whatsappNumber"]);
  });
});
