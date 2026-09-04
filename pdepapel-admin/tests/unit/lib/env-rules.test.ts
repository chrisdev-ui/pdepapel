import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  isVercelProductionBuild,
  requiredInProduction,
} from "@/lib/env-rules.mjs";

const measurementId = z
  .string()
  .regex(/^G-[A-Z0-9]+$/, "Debe ser un ID de medición válido de GA4");

describe("requiredInProduction", () => {
  it("detects Vercel production builds only", () => {
    expect(isVercelProductionBuild({ VERCEL_ENV: "production" })).toBe(true);
    expect(isVercelProductionBuild({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isVercelProductionBuild({ VERCEL_ENV: "development" })).toBe(false);
    expect(isVercelProductionBuild({})).toBe(false);
  });

  it("rejects a missing value in a production build", () => {
    const schema = requiredInProduction(measurementId, {
      VERCEL_ENV: "production",
    });

    expect(schema.safeParse(undefined).success).toBe(false);
    expect(schema.safeParse("").success).toBe(false);
    expect(schema.safeParse("G-8X3M77ZB3Z").success).toBe(true);
  });

  it("keeps the value optional outside production but still validates its format", () => {
    for (const environment of [{ VERCEL_ENV: "preview" }, {}]) {
      const schema = requiredInProduction(measurementId, environment);

      expect(schema.safeParse(undefined).success).toBe(true);
      expect(schema.safeParse("G-8X3M77ZB3Z").success).toBe(true);
      expect(schema.safeParse("UA-12345-1").success).toBe(false);
    }
  });
});
