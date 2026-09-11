import { describe, expect, it } from "vitest";

import { getUnitCostFloor, parseTransportationCost } from "@/lib/product-costs";

describe("product unit costs", () => {
  it("parses the extra cost from a form value and refuses negatives", () => {
    expect(parseTransportationCost("750")).toBe(750);
    expect(parseTransportationCost(1000.555)).toBe(1000.56);
    expect(parseTransportationCost("")).toBeNull();
    expect(parseTransportationCost(-1)).toBeNull();
    expect(parseTransportationCost("abc")).toBeNull();
  });

  it("adds the extra cost to the acquisition cost, but only when there is an acquisition cost", () => {
    expect(getUnitCostFloor({ acqPrice: 4000, transportationCost: 1000 })).toBe(5000);
    expect(getUnitCostFloor({ acqPrice: 4000, transportationCost: null })).toBe(4000);
    expect(getUnitCostFloor({ acqPrice: 4000 })).toBe(4000);
    expect(getUnitCostFloor({ acqPrice: null, transportationCost: 1000 })).toBeNull();
    expect(getUnitCostFloor({ acqPrice: 0, transportationCost: 1000 })).toBeNull();
  });
});
