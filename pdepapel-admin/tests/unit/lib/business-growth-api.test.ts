import { describe, expect, it } from "vitest";

import {
  parseBusinessCashMovement,
  parseBusinessCashPolicy,
  parseCampaignDraft,
  parseCampaignStatus,
} from "@/lib/business-growth-api";
import { DEFAULT_BUSINESS_CASH_POLICY } from "@/lib/business-growth";

describe("business growth request parsers", () => {
  it("accepts a valid cash policy and rejects an over-distribution", () => {
    expect(
      parseBusinessCashPolicy({
        ...DEFAULT_BUSINESS_CASH_POLICY,
        reinvestmentRate: 60,
        ownerDrawRate: 40,
      }),
    ).toMatchObject({
      reinvestmentRate: 60,
      ownerDrawRate: 40,
    });

    expect(() =>
      parseBusinessCashPolicy({
        ...DEFAULT_BUSINESS_CASH_POLICY,
        reinvestmentRate: 70,
        ownerDrawRate: 40,
      }),
    ).toThrow("no pueden superar el 100%");
  });

  it("parses only real positive movements using Colombian calendar dates", () => {
    expect(
      parseBusinessCashMovement({
        type: "MARKETING_SPEND",
        amount: "25000",
        description: "Impulso de publicación",
        occurredAt: "2026-08-24",
        reference: "Meta agosto",
      }),
    ).toMatchObject({
      type: "MARKETING_SPEND",
      amount: 25000,
      occurredAt: new Date("2026-08-24T05:00:00.000Z"),
    });

    expect(() =>
      parseBusinessCashMovement({
        type: "MARKETING_SPEND",
        amount: 0,
        description: "No válido",
        occurredAt: "2026-08-24",
      }),
    ).toThrow("debe ser mayor que cero");
  });

  it("keeps social campaigns as drafts until a platform connection exists", () => {
    expect(
      parseCampaignDraft({
        productId: "product-1",
        name: "Prueba cuadernos",
        channel: "INSTAGRAM",
        objective: "SALES",
        status: "READY",
        plannedBudget: 30000,
      }),
    ).toMatchObject({
      channel: "INSTAGRAM",
      status: "READY",
      plannedBudget: 30000,
    });

    expect(() =>
      parseCampaignDraft({
        productId: "product-1",
        name: "No activar",
        channel: "INSTAGRAM",
        objective: "SALES",
        status: "ACTIVE",
      }),
    ).toThrow("Solo puedes guardar una campaña");

    expect(() => parseCampaignStatus({ status: "ACTIVE" })).toThrow(
      "solo puede activarse después de conectar",
    );
  });
});
