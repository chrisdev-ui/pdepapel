import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn() }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));

import { BOLD_UNREPORTED_TIP_TOLERANCE, boldAmountMatchesOrder } from "@/lib/payment-settlement";

const order = { total: 50_000, giftCardAmount: 10_000 };

describe("monto de Bold contra lo que mandamos en el enlace", () => {
  it("compara contra el total menos la tarjeta de regalo", () => {
    expect(boldAmountMatchesOrder(order, { total: 40_000 })).toBe(true);
    expect(boldAmountMatchesOrder(order, { total: 50_000, tip: 0 })).toBe(false);
  });

  it("con la propina informada, compara total − propina (el total de Bold la incluye)", () => {
    expect(boldAmountMatchesOrder(order, { total: 44_000, tip: 4_000 })).toBe(true);
    expect(boldAmountMatchesOrder(order, { total: 44_000, tip: 3_000 })).toBe(false);
    expect(boldAmountMatchesOrder(order, { total: "44000", tip: "4000" })).toBe(true);
  });

  it("sin propina informada, un excedente pequeño cuenta como propina y no alerta", () => {
    expect(BOLD_UNREPORTED_TIP_TOLERANCE).toBe(0.2);
    expect(boldAmountMatchesOrder(order, { total: 44_000 })).toBe(true);
    expect(boldAmountMatchesOrder(order, { total: 48_000 })).toBe(true);
    expect(boldAmountMatchesOrder(order, { total: 48_001 })).toBe(false);
  });

  it("un monto menor o ilegible nunca coincide", () => {
    expect(boldAmountMatchesOrder(order, { total: 39_999 })).toBe(false);
    expect(boldAmountMatchesOrder(order, { total: "abc" })).toBe(false);
    expect(boldAmountMatchesOrder(order, { total: null })).toBe(false);
  });
});
