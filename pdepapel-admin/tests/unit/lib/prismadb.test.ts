import { describe, expect, it } from "vitest";

import { describeConnectionPool, getPrismaLogLevels, POOL_CONNECTION_LIMIT, withConnectionPoolParams } from "@/lib/prismadb";

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
    expect(withConnectionPoolParams("mysql://u:p@host:3306/db")).toBe("mysql://u:p@host:3306/db?connection_limit=6&pool_timeout=20&max_idle_connection_lifetime=60&max_connection_lifetime=900");
  });

  it("fits the historical peak with every pool full under MySQL's 200 connections", () => {
    // 85 conexiones con 3 por instancia (2026-09-15) ≈ 28 instancias a la vez.
    const peakInstances = Math.ceil(85 / 3);
    expect(POOL_CONNECTION_LIMIT).toBe(6);
    expect(peakInstances * POOL_CONNECTION_LIMIT).toBeLessThan(200);
  });

  it("keeps other URL parameters and lets explicit options win", () => {
    expect(withConnectionPoolParams("mysql://u:p@host/db?sslaccept=strict")).toBe("mysql://u:p@host/db?sslaccept=strict&connection_limit=6&pool_timeout=20&max_idle_connection_lifetime=60&max_connection_lifetime=900");
    expect(withConnectionPoolParams("mysql://u:p@host/db", { connectionLimit: 2, poolTimeout: 5 })).toBe("mysql://u:p@host/db?connection_limit=2&pool_timeout=5&max_idle_connection_lifetime=60&max_connection_lifetime=900");
  });

  it("respects values already present in the URL", () => {
    expect(withConnectionPoolParams("mysql://u:p@host/db?connection_limit=10")).toBe("mysql://u:p@host/db?connection_limit=10&pool_timeout=20&max_idle_connection_lifetime=60&max_connection_lifetime=900");
    expect(withConnectionPoolParams("mysql://u:p@host/db?pool_timeout=5&connection_limit=1&max_idle_connection_lifetime=60&max_connection_lifetime=900")).toBe("mysql://u:p@host/db?pool_timeout=5&connection_limit=1&max_idle_connection_lifetime=60&max_connection_lifetime=900");
  });

  it("leaves an empty or unparsable value alone", () => {
    expect(withConnectionPoolParams(undefined)).toBeUndefined();
    expect(withConnectionPoolParams("not a url")).toBe("not a url");
  });
});

describe("connection lifetimes", () => {
  it("recycles idle and long-lived connections so orphaned prepared statements are freed", () => {
    expect(withConnectionPoolParams("mysql://u:p@host/db?max_idle_connection_lifetime=30")).toBe(
      "mysql://u:p@host/db?max_idle_connection_lifetime=30&connection_limit=6&pool_timeout=20&max_connection_lifetime=900",
    );
  });

  it("describes the effective pool without host, user or password", () => {
    const description = describeConnectionPool("mysql://secret-user:secret-pass@db.internal:3306/railway?connection_limit=4");
    expect(description).toEqual({
      connection_limit: "4",
      pool_timeout: "20",
      max_idle_connection_lifetime: "60",
      max_connection_lifetime: "900",
      fromUrl: ["connection_limit"],
    });
    expect(JSON.stringify(description)).not.toMatch(/secret|db\.internal|railway/);
    expect(describeConnectionPool(undefined)).toBeNull();
  });
});
