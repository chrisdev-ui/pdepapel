import { describe, expect, it } from "vitest";

import { getPrismaLogLevels, withConnectionPoolParams } from "@/lib/prismadb";

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

describe("connection pool parameters", () => {
  it("adds a small per-instance pool and a bounded wait to a plain URL", () => {
    expect(withConnectionPoolParams("mysql://u:p@host:3306/db")).toBe("mysql://u:p@host:3306/db?connection_limit=3&pool_timeout=20");
  });

  it("respects values already present in the URL", () => {
    expect(withConnectionPoolParams("mysql://u:p@host/db?connection_limit=10")).toBe("mysql://u:p@host/db?connection_limit=10&pool_timeout=20");
    expect(withConnectionPoolParams("mysql://u:p@host/db?pool_timeout=5&connection_limit=1")).toBe("mysql://u:p@host/db?pool_timeout=5&connection_limit=1");
  });

  it("leaves an empty or unparsable value alone", () => {
    expect(withConnectionPoolParams(undefined)).toBeUndefined();
    expect(withConnectionPoolParams("not a url")).toBe("not a url");
  });
});
