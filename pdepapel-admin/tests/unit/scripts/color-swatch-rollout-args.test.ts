import { describe, expect, it } from "vitest";

import { parseHexArg } from "../../../scripts/lib/color-swatch-rollout";

/** Los hex del paso «c» los elige Paula: sin valor por defecto, el guion no corre. */
describe("parseHexArg", () => {
  it("refuses a missing value", () => {
    expect(() => parseHexArg(undefined, "--blue-hex")).toThrow(/falta --blue-hex/);
  });
  it("refuses anything that is not #rrggbb", () => {
    for (const bad of ["1E90FF", "#1E90F", "#1E90FFF", "#GGGGGG", "azul"]) {
      expect(() => parseHexArg(bad, "--purple-hex"), bad).toThrow(/--purple-hex debe ser #rrggbb/);
    }
  });
  it("normalizes to upper case", () => {
    expect(parseHexArg("#1e90ff", "--blue-hex")).toBe("#1E90FF");
  });
});
