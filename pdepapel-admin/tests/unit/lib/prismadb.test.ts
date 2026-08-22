import { describe, expect, it } from "vitest";

import { getPrismaLogLevels } from "@/lib/prismadb";

describe("Prisma production logging", () => {
  it("does not serialize every database query in production", () => {
    expect(getPrismaLogLevels("production")).toEqual(["warn", "error"]);
  });

  it("keeps detailed logs available during local development", () => {
    expect(getPrismaLogLevels("development")).toEqual([
      "query",
      "info",
      "warn",
      "error",
    ]);
  });
});
