import { describe, expect, it } from "vitest";

import { withUtmParams } from "@/lib/capsule-links";

describe("withUtmParams (/capsulas → edición LIVE)", () => {
  it("pasa solo los utm_* de la bio y nada más", () => {
    expect(withUtmParams("/capsulas/1-escritorio", {})).toBe("/capsulas/1-escritorio");
    expect(withUtmParams("/capsulas/1-escritorio", { utm_source: "instagram", utm_medium: "social", utm_campaign: "capsulas", vista: "x", fbclid: "y" })).toBe(
      "/capsulas/1-escritorio?utm_source=instagram&utm_medium=social&utm_campaign=capsulas",
    );
    expect(withUtmParams("/capsulas/1-escritorio", { UTM_Source: ["tiktok", "otra"] })).toBe("/capsulas/1-escritorio?UTM_Source=tiktok&UTM_Source=otra");
  });
});
