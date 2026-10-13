import { describe, expect, it } from "vitest";

import { summarizeBurstDecisions } from "@/lib/whatsapp/shadow/report";

describe("summarizeBurstDecisions", () => {
  it("cuenta las ráfagas en que el modo ráfaga contestaría otra cosa, por intención y con lo que hizo el bot real", () => {
    const decision = (size: number, differs: boolean, chosenIntent: string) => ({ mode: "shadow", size, differs, chosenIntent });
    const report = summarizeBurstDecisions([
      { burstDecision: null, realOutcome: "replied" },
      { burstDecision: decision(1, false, "product"), realOutcome: "replied_product" },
      { burstDecision: decision(2, false, "product"), realOutcome: "replied_product" },
      { burstDecision: decision(2, true, "product"), realOutcome: "escalated_no_match" },
      { burstDecision: decision(3, true, "product"), realOutcome: "skipped_welcome_repeat" },
      { burstDecision: decision(3, true, "product"), realOutcome: "escalated_no_match" },
      { burstDecision: decision(2, true, "order"), realOutcome: "replied" },
    ]);
    expect(report).toEqual({
      evaluated: 6,
      bursts: 5,
      differs: 4,
      byChosenIntent: [
        { intent: "product", count: 3, realOutcomes: [{ outcome: "escalated_no_match", count: 2 }, { outcome: "skipped_welcome_repeat", count: 1 }] },
        { intent: "order", count: 1, realOutcomes: [{ outcome: "replied", count: 1 }] },
      ],
    });
  });
});
