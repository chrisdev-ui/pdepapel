import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ writes: [] as string[], clients: 0 }));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: (options: { signal?: AbortSignal }) => {
      redis.clients += 1;
      return {
        get: async () => null,
        set: async (key: string) => {
          if (options.signal?.aborted) throw new Error("abortado");
          redis.writes.push(key);
        },
      };
    },
  },
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: {
      aggregate: vi.fn(async () => ({ _count: { _all: 3 }, _max: { updatedAt: new Date(1000) } })),
      findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock("@/lib/sales-velocity", () => ({
  DEFAULT_SLOW_DAYS: 90,
  // Un año de ventas tarda: más que el plazo del cliente de Redis.
  loadSalesHistory: vi.fn(() => new Promise((resolve) => setTimeout(() => resolve({ days: 90, now: new Date(), get: () => ({}) }), 1700))),
  loadFirstStockedAt: vi.fn(async () => new Map()),
  rankSlowMovers: vi.fn(() => []),
  stockedSinceOf: vi.fn(),
  unitCostOf: vi.fn(),
}));

import { loadIdleProducts } from "@/lib/capsule-idle";

describe("caché de productos quietos", () => {
  beforeEach(() => {
    vi.stubEnv("KV_REST_API_URL", "https://redis.test");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    redis.writes = [];
    redis.clients = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("guarda el cálculo aunque tarde más que el plazo de un cliente de Redis, con la huella del catálogo en la clave", async () => {
    await loadIdleProducts("tienda-1");
    expect(redis.writes).toEqual(["store:tienda-1:capsule-idle:v2:3:1000"]);
    expect(redis.clients).toBe(2);
  }, 10_000);
});
