import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  describePresaleArrival,
  isDepositPresaleItem,
  PRESALE_MAX_PER_ORDER,
  presaleUnitDeposit,
} from "@/lib/presale-deposit";
import { calculateTotals } from "@/lib/utils";
import type { Product } from "@/types";

const repo = path.resolve(__dirname, "../../../..");

describe("anticipo de una unidad (copia del panel)", () => {
  it("fijo: el valor, sin pasar del precio", () => {
    expect(presaleUnitDeposit({ depositType: "FIXED", depositValue: 30000 }, 160000)).toBe(30000);
    expect(presaleUnitDeposit({ depositType: "FIXED", depositValue: 30000 }, 20000)).toBe(20000);
  });

  it("porcentaje: redondeado al peso", () => {
    expect(presaleUnitDeposit({ depositType: "PERCENT", depositValue: 25 }, 160000)).toBe(40000);
    expect(presaleUnitDeposit({ depositType: "PERCENT", depositValue: 33 }, 9999)).toBe(3300);
    expect(presaleUnitDeposit({ depositType: "PERCENT", depositValue: 150 }, 10000)).toBe(10000);
  });

  it("sin tipo o sin valor, la unidad se paga completa", () => {
    expect(presaleUnitDeposit({ depositType: null, depositValue: 30000 }, 160000)).toBe(160000);
    expect(presaleUnitDeposit({ depositType: "FIXED", depositValue: null }, 160000)).toBe(160000);
    expect(presaleUnitDeposit({ depositType: "FIXED", depositValue: 0 }, 160000)).toBe(160000);
  });

  it("es la misma cuenta que lib/presale-deposit.ts del panel", () => {
    const admin = readFileSync(path.join(repo, "pdepapel-admin/lib/presale-deposit.ts"), "utf8");
    expect(admin).toContain('if (presale.depositType === "PERCENT") return Math.min(price, Math.round((price * value) / 100));');
    expect(admin).toContain("return Math.min(price, Math.round(value));");
    const presale = readFileSync(path.join(repo, "pdepapel-admin/lib/presale.ts"), "utf8");
    expect(presale).toContain(`export const PRESALE_MAX_PER_ORDER = ${PRESALE_MAX_PER_ORDER};`);
  });
});

describe("fecha estimada de la preventa", () => {
  it("con fecha: «Fecha estimada: 5 de diciembre»", () => {
    expect(describePresaleArrival({ expectedArrivalAt: "2026-12-05T17:00:00.000Z", expectedArrivalText: "ignorado" })).toBe(
      "Fecha estimada: 5 de diciembre",
    );
  });

  it("con texto: «Fecha estimada: <texto>»", () => {
    expect(describePresaleArrival({ expectedArrivalAt: null, expectedArrivalText: " primera semana de diciembre " })).toBe(
      "Fecha estimada: primera semana de diciembre",
    );
  });

  it("sin nada: «Fecha estimada: por confirmar»", () => {
    expect(describePresaleArrival({ expectedArrivalAt: null, expectedArrivalText: null })).toBe("Fecha estimada: por confirmar");
    expect(describePresaleArrival({ expectedArrivalAt: null, expectedArrivalText: "  " })).toBe("Fecha estimada: por confirmar");
  });
});

const depositProduct = (overrides: Partial<Product> = {}) =>
  ({
    id: "cal",
    name: "Calendario de adviento",
    price: 160000,
    stock: 0,
    quantity: 1,
    presales: [
      {
        id: "ps",
        expectedArrivalAt: null,
        expectedArrivalText: null,
        unitLimit: null,
        committedUnits: 0,
        paymentMode: "DEPOSIT",
        depositType: "FIXED",
        depositValue: 30000,
        termsText: null,
      },
    ],
    ...overrides,
  }) as unknown as Product;

describe("totales de un carrito con anticipo", () => {
  it("dueNow es el anticipo; total sigue siendo el valor del producto", () => {
    const totals = calculateTotals([depositProduct({ quantity: 2 })], null);
    expect(isDepositPresaleItem(depositProduct())).toBe(true);
    expect(totals.isDepositCart).toBe(true);
    expect(totals.total).toBe(320000);
    expect(totals.subtotal).toBe(320000);
    expect(totals.dueNow).toBe(60000);
    expect(totals.balanceDue).toBe(260000);
  });

  it("no lleva cupón, envío, recaudo ni envío gratis", () => {
    const coupon = { id: "c", code: "HOLA", type: "FIXED", amount: 10000, isActive: true, minOrderValue: 0 } as never;
    const totals = calculateTotals([depositProduct()], coupon, 18000, 100000, 7000);
    expect(totals.couponDiscount).toBe(0);
    expect(totals.shippingCost).toBe(0);
    expect(totals.codFee).toBe(0);
    expect(totals.freeShipping).toBe(false);
    expect(totals.total).toBe(160000);
    expect(totals.dueNow).toBe(30000);
  });

  it("un carrito normal: dueNow es el total y no hay saldo", () => {
    const totals = calculateTotals([{ id: "p", name: "Lapicero", price: 5000, stock: 9, quantity: 2 } as unknown as Product], null, 10000);
    expect(totals.isDepositCart).toBe(false);
    expect(totals.dueNow).toBe(totals.total);
    expect(totals.dueNow).toBe(20000);
    expect(totals.balanceDue).toBe(0);
  });

  it("una preventa completa (FULL) se paga entera", () => {
    const full = depositProduct();
    full.presales![0].paymentMode = "FULL";
    const totals = calculateTotals([full], null);
    expect(totals.isDepositCart).toBe(false);
    expect(totals.dueNow).toBe(160000);
  });
});
