import { describe, expect, it, vi } from "vitest";

import { quoteWithCodFees, solveCodFee, type CodQuoteRate } from "@/lib/cod-fee";

/** Una transportadora que cobra un % del valor a recaudar más un fijo. */
const percentPlusFixed = (rate: number, fixed: number) => (codValue: number) => rate * codValue + fixed;

describe("recaudo contra entrega: el punto fijo", () => {
  it("con % + fijo, el recaudo cobrado es exactamente el que cobra EnvioClick sobre el total con recaudo", () => {
    const fee = percentPlusFixed(0.03, 3000);
    const base = 120_000;
    const v1 = 100_000;
    const v2 = base + fee(v1);
    const solved = solveCodFee(base, { codValue: v1, fee: fee(v1) }, { codValue: v2, fee: fee(v2) });

    // 0,03·(120.000 + F) + 3.000 = F  →  F = 6.600 / 0,97 = 6.804,12 → 6.805
    expect(solved).toBe(6805);
    expect(solved).toBeGreaterThanOrEqual(fee(base + solved) - 0.5);
    expect(solved - fee(base + solved)).toBeLessThan(1);
  });

  it("una sola recotización con el recaudo de la primera se queda corta; el punto fijo no", () => {
    const fee = percentPlusFixed(0.03, 3000);
    const base = 120_000;
    const v2 = base + fee(100_000);
    expect(Math.ceil(fee(v2))).toBeLessThan(solveCodFee(base, { codValue: 100_000, fee: fee(100_000) }, { codValue: v2, fee: fee(v2) }));
  });

  it("plano: el recaudo es el mismo valga lo que valga el pedido", () => {
    expect(solveCodFee(120_000, { codValue: 100_000, fee: 5000 }, { codValue: 125_000, fee: 5000 })).toBe(5000);
  });

  it("sin dos valores distintos o con un % absurdo, cobra lo de la segunda cotización", () => {
    expect(solveCodFee(120_000, { codValue: 100_000, fee: 5000 }, { codValue: 100_000, fee: 5100 })).toBe(5100);
    expect(solveCodFee(120_000, { codValue: 100_000, fee: 5000 }, { codValue: 101_000, fee: 9000 })).toBe(9000);
    expect(solveCodFee(120_000, { codValue: 100_000, fee: 6000 }, { codValue: 125_000, fee: 5000 })).toBe(6000);
  });

  it("siempre redondea hacia arriba, al peso", () => {
    expect(solveCodFee(0, { codValue: 0, fee: 4000.2 }, { codValue: 4001, fee: 4000.2 })).toBe(4001);
  });
});

describe("cotizar con recaudo dos veces", () => {
  const fee = percentPlusFixed(0.03, 3000);
  const rates = (codValue: number): CodQuoteRate[] => [
    { idRate: codValue + 1, carrier: "ENVIA", product: "Normal", totalCost: 18_000, isCOD: true, codCost: fee(codValue) },
    { idRate: codValue + 2, carrier: "COORDINADORA", product: "Normal", totalCost: 25_000, isCOD: true, codCost: 6000 },
    { idRate: codValue + 3, carrier: "ENVIA", product: "Normal", totalCost: 16_000, isCOD: false, codCost: null },
  ];

  it("cada tarifa que recauda trae su recaudo final y el idRate de la segunda cotización", async () => {
    const quote = vi.fn(async (codValue: number) => rates(codValue));
    const result = await quoteWithCodFees({ amountBeforeShipping: 100_000, quote, shippingOf: (rate) => rate.totalCost });

    expect(quote).toHaveBeenCalledTimes(2);
    const envia = result.find((rate) => rate.carrier === "ENVIA" && rate.isCOD)!;
    expect(envia.codFee).toBe(solveCodFee(118_000, { codValue: 100_000, fee: fee(100_000) }, { codValue: quote.mock.calls[1][0], fee: fee(quote.mock.calls[1][0]) }));
    expect(envia.idRate).toBe(quote.mock.calls[1][0] + 1);
    expect(result.find((rate) => rate.carrier === "COORDINADORA")!.codFee).toBe(6000);
    expect(result.find((rate) => !rate.isCOD)!.codFee).toBeNull();
  });

  it("con envío gratis el recaudo se calcula sobre el pedido sin envío", async () => {
    const quote = vi.fn(async (codValue: number) => rates(codValue));
    const result = await quoteWithCodFees({ amountBeforeShipping: 100_000, quote, shippingOf: () => 0, focus: (rate) => rate.carrier === "ENVIA" });
    const envia = result.find((rate) => rate.carrier === "ENVIA" && rate.isCOD)!;
    // 0,03·(100.000 + F) + 3.000 = F → F = 6.000 / 0,97 = 6.185,57 → 6.186
    expect(envia.codFee).toBe(6186);
    expect(quote.mock.calls[1][0]).toBe(100_000 + fee(100_000));
  });

  it("si nadie recauda, una sola cotización y ningún recaudo", async () => {
    const quote = vi.fn(async (codValue: number) => rates(codValue).filter((rate) => !rate.isCOD));
    const result = await quoteWithCodFees({ amountBeforeShipping: 100_000, quote, shippingOf: (rate) => rate.totalCost });
    expect(quote).toHaveBeenCalledTimes(1);
    expect(result.every((rate) => rate.codFee === null)).toBe(true);
  });
});
