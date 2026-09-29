import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La invalidación de caché acompaña a escrituras ya hechas y nunca puede
 * retener la función: el 2026-09-29 un SCAN de purga sin tope colgó «Marcar
 * como pagado» hasta los 60 s de Vercel. Aquí Redis se cuelga o va lento y
 * la invalidación devuelve igual dentro del presupuesto, sin lanzar.
 */
const redis = vi.hoisted(() => ({ scan: vi.fn(), del: vi.fn(), fromEnv: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: redis.fromEnv } }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/mercadolibre/outbox", () => ({ enqueuePendingMarketplaceOutboxEventsForStore: vi.fn().mockResolvedValue(0) }));

import { invalidateStoreProductsCache, withTimeBudget } from "@/lib/cache";

describe("cache invalidation never holds the request", () => {
  beforeEach(() => {
    redis.scan.mockReset();
    redis.del.mockReset().mockResolvedValue(1);
    redis.fromEnv.mockReset().mockImplementation(() => ({ scan: redis.scan, del: redis.del }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns within the budget when Redis never answers", async () => {
    redis.scan.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    await expect(invalidateStoreProductsCache("s1", undefined, { budgetMs: 150 })).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("no terminó en 150 ms"));
  });

  it("stops scanning at the deadline instead of walking the whole keyspace", async () => {
    // Un SCAN que nunca termina (cursor siempre 1) y tarda 20 ms por llamada.
    redis.scan.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([1, []]), 20)));
    await invalidateStoreProductsCache("s1", undefined, { budgetMs: 600, purgeBudgetMs: 100 });
    // Con 500 iteraciones por patrón y 4 patrones serían 2000 llamadas: el tope de tiempo las corta mucho antes.
    expect(redis.scan.mock.calls.length).toBeLessThan(20);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("stopped at the 100 ms budget"));
  });

  it("purges normally when Redis is healthy, deleting what each pattern found", async () => {
    redis.scan.mockResolvedValueOnce([0, ["store:s1:products:a"]]).mockResolvedValue([0, []]);
    await invalidateStoreProductsCache("s1");
    expect(redis.del).toHaveBeenCalledWith("store:s1:products:a");
    expect(redis.scan).toHaveBeenCalledTimes(4);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("uses a one-shot client with a single short retry and an abort signal", async () => {
    redis.scan.mockResolvedValue([0, []]);
    await invalidateStoreProductsCache("s1");
    const config = redis.fromEnv.mock.calls[0]?.[0] as { retry?: { retries?: number }; signal?: AbortSignal };
    expect(config?.retry?.retries).toBe(1);
    expect(config?.signal).toBeInstanceOf(AbortSignal);
  });

  it("swallows Redis errors and still resolves", async () => {
    redis.scan.mockRejectedValue(new Error("fetch failed"));
    await expect(invalidateStoreProductsCache("s1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Redis cache purge error"), expect.any(Error));
  });

  it("withTimeBudget returns the value when the work is fast and undefined when it is not", async () => {
    await expect(withTimeBudget("rápido", 200, Promise.resolve(42))).resolves.toBe(42);
    await expect(withTimeBudget("lento", 30, new Promise(() => {}))).resolves.toBeUndefined();
    await expect(withTimeBudget("roto", 200, Promise.reject(new Error("x")))).resolves.toBeUndefined();
  });
});
