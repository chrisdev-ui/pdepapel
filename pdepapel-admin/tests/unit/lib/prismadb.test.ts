import { describe, expect, it } from "vitest";

import { getPrismaLogLevels, POOL_CONNECTION_LIMIT, withConnectionPoolParams } from "@/lib/prismadb";

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
  it("adds a bounded per-instance pool and wait to a plain URL", () => {
    expect(withConnectionPoolParams("mysql://u:p@host:3306/db")).toBe("mysql://u:p@host:3306/db?connection_limit=6&pool_timeout=20");
  });

  it("keeps the historical peak well below MySQL's 300 connections", () => {
    // 85 conexiones con 3 por instancia (2026-09-15) ≈ 28 instancias a la vez.
    const peakInstances = Math.ceil(85 / 3);
    expect(POOL_CONNECTION_LIMIT).toBe(6);
    expect(peakInstances * POOL_CONNECTION_LIMIT).toBeLessThanOrEqual(300 * 0.6);
  });

  it("keeps other URL parameters and lets explicit options win", () => {
    expect(withConnectionPoolParams("mysql://u:p@host/db?sslaccept=strict")).toBe("mysql://u:p@host/db?sslaccept=strict&connection_limit=6&pool_timeout=20");
    expect(withConnectionPoolParams("mysql://u:p@host/db", { connectionLimit: 2, poolTimeout: 5 })).toBe("mysql://u:p@host/db?connection_limit=2&pool_timeout=5");
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
