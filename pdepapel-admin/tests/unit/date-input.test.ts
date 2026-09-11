import { describe, expect, it } from "vitest";

import { coerceDate, isIsoInstantString, reviveDates, toDateInputValue } from "@/lib/date-input";

describe("toDateInputValue", () => {
  it("formats a Date as yyyy-MM-dd", () => {
    expect(toDateInputValue(new Date(2026, 8, 15, 10, 30))).toBe("2026-09-15");
  });

  it("accepts an ISO string, as a draft restored from localStorage would carry", () => {
    expect(toDateInputValue("2026-09-15T05:00:00.000Z")).toMatch(/^2026-09-1[45]$/);
  });

  it("never throws on invalid input and renders an empty field", () => {
    expect(toDateInputValue("not a date")).toBe("");
    expect(toDateInputValue(new Date("nope"))).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("")).toBe("");
    expect(toDateInputValue({})).toBe("");
  });
});

describe("coerceDate", () => {
  it("returns undefined for invalid Dates and unparsable strings", () => {
    expect(coerceDate(new Date(NaN))).toBeUndefined();
    expect(coerceDate("2026-13-45")).toBeUndefined();
    expect(coerceDate(Number.NaN)).toBeUndefined();
  });

  it("keeps a valid Date and parses ISO days and timestamps", () => {
    const date = new Date(2026, 0, 2);
    expect(coerceDate(date)).toBe(date);
    expect(coerceDate("2026-01-02")?.getFullYear()).toBe(2026);
    expect(coerceDate(date.getTime())?.getTime()).toBe(date.getTime());
  });
});

describe("reviveDates", () => {
  it("turns JSON-serialised Date instants back into Date objects, deeply", () => {
    const draft = JSON.parse(
      JSON.stringify({
        name: "Pedido",
        expiresAt: new Date("2026-09-20T12:00:00.000Z"),
        shipping: { method: "MANUAL", estimatedDeliveryDate: new Date("2026-09-15T05:00:00.000Z") },
        orderItems: [{ quantity: 2, addedAt: new Date("2026-09-11T00:00:00.000Z") }],
        notes: "2026-09-11",
      }),
    );

    const revived = reviveDates(draft);

    expect(revived.expiresAt).toBeInstanceOf(Date);
    expect(revived.shipping.estimatedDeliveryDate).toBeInstanceOf(Date);
    expect(revived.shipping.method).toBe("MANUAL");
    expect(revived.orderItems[0].addedAt).toBeInstanceOf(Date);
    expect(revived.orderItems[0].quantity).toBe(2);
    expect(revived.notes).toBe("2026-09-11");
    expect(revived.name).toBe("Pedido");
  });

  it("leaves non-instant strings, numbers and null untouched", () => {
    expect(reviveDates({ a: "2026-09-11", b: 3, c: null, d: "text" })).toEqual({ a: "2026-09-11", b: 3, c: null, d: "text" });
    expect(isIsoInstantString("2026-09-11")).toBe(false);
    expect(isIsoInstantString("2026-09-11T10:00:00Z")).toBe(true);
    expect(isIsoInstantString("2026-09-11T10:00:00.000-05:00")).toBe(true);
  });
});
