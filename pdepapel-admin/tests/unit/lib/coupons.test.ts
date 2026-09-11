import { describe, expect, it } from "vitest";

import { buildBatchCode, COUPON_CODE_PATTERN, parseCouponBatchInput, parseCouponInput } from "@/lib/coupons";

const base = { code: " vuelve-10 ", type: "PERCENTAGE", amount: 10, startDate: "2026-09-01", endDate: "2026-09-30" };

describe("parseCouponInput", () => {
  it("normalizes the code, expands the window and applies defaults", () => {
    const input = parseCouponInput({ ...base, maxUses: "", minOrderValue: "" });
    expect(input.code).toBe("VUELVE-10");
    expect(input.maxUses).toBeNull();
    expect(input.minOrderValue).toBe(0);
    expect(input.isActive).toBe(true);
    expect(input.isWelcomeBenefit).toBe(false);
    expect(input.startDate.toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(input.endDate.toISOString()).toBe("2026-10-01T04:59:59.999Z");
  });

  it("keeps an explicit usage limit and accepts hyphenated batch codes", () => {
    expect(parseCouponInput({ ...base, maxUses: 50 }).maxUses).toBe(50);
    expect(COUPON_CODE_PATTERN.test("VUELVE-C6418B")).toBe(true);
    expect(COUPON_CODE_PATTERN.test("-ABC")).toBe(false);
    expect(COUPON_CODE_PATTERN.test("ABC")).toBe(false);
  });

  it("rejects bad amounts, codes and windows with Spanish messages", () => {
    expect(() => parseCouponInput({ ...base, amount: 0 })).toThrow("El descuento debe ser mayor a 0");
    expect(() => parseCouponInput({ ...base, amount: 120 })).toThrow("El porcentaje no puede ser mayor a 100");
    expect(() => parseCouponInput({ ...base, amount: 12.5 })).toThrow("El porcentaje debe ser un número entero");
    expect(() => parseCouponInput({ ...base, code: "a b" })).toThrow("El código debe tener entre 4 y 20 caracteres");
    expect(() => parseCouponInput({ ...base, endDate: "2026-08-30" })).toThrow("La fecha de inicio no puede ser posterior");
    expect(() => parseCouponInput({ ...base, maxUses: 0 })).toThrow("El máximo de usos debe ser al menos 1");
    expect(() => parseCouponInput({ ...base, type: "GIFT" })).toThrow("Elige el tipo de descuento");
    expect(parseCouponInput({ ...base, type: "FIXED", amount: 12.5 }).amount).toBe(12.5);
  });
});

describe("coupon batches", () => {
  it("builds unambiguous codes with the prefix", () => {
    const code = buildBatchCode("VUELVE", () => 0.5);
    expect(code).toMatch(/^VUELVE-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    expect(buildBatchCode("", () => 0)).toBe("AAAAA");
  });

  it("parses the batch conditions", () => {
    const input = parseCouponBatchInput({ prefix: "feria", quantity: "20", type: "PERCENTAGE", amount: 10, startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(input).toMatchObject({ prefix: "FERIA", quantity: 20, maxUses: 1, minOrderValue: 0 });
    expect(() => parseCouponBatchInput({ prefix: "x", quantity: 500, type: "FIXED", amount: 1000, startDate: "2026-10-01", endDate: "2026-10-31" })).toThrow("Hasta 100 cupones por lote");
    expect(() => parseCouponBatchInput({ prefix: "fe ria", quantity: 5, type: "FIXED", amount: 1000, startDate: "2026-10-01", endDate: "2026-10-31" })).toThrow("El prefijo solo admite letras y números");
  });
});
