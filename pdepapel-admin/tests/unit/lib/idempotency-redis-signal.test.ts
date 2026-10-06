import { Redis, type RedisConfigNodejs } from "@upstash/redis";
import { afterEach, describe, expect, it, vi } from "vitest";

import { idempotencyRedisOptions } from "@/lib/idempotency";

/**
 * Reproduce `[IDEMPOTENCY] … s.map is not a function` (logs de producción del
 * 2026-10-06, POST /api/:id/orders) con el SDK real y un fetch falso que
 * respeta la señal, como el de Upstash.
 */
const fakeUpstashFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.signal?.aborted) throw new DOMException("This operation was aborted", "AbortError");
  const url = String(input);
  const commands = JSON.parse(String(init?.body ?? "[]"));
  const body = url.endsWith("/pipeline") ? commands.map(() => ({ result: "OK" })) : { result: "OK" };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
});

const client = (options: Omit<RedisConfigNodejs, "url" | "token">) =>
  new Redis({ url: "https://fake.upstash.io", token: "test-token", ...options });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  vi.unstubAllGlobals();
  fakeUpstashFetch.mockClear();
});

describe("Redis client for idempotency", () => {
  it("the old single signal broke every command sent after the budget («s.map is not a function»)", async () => {
    vi.stubGlobal("fetch", fakeUpstashFetch);
    const old = client({ retry: { retries: 1, backoff: () => 1 }, signal: AbortSignal.timeout(20) });
    await expect(old.set("idem-lock:s:k", "1", { nx: true, ex: 60 })).resolves.toBe("OK");
    await sleep(60); // el handler del pedido tarda más que el presupuesto
    await expect(old.set("idem:s:k", { status: 200, body: {} })).rejects.toThrow(/map is not a function/);
  });

  it("a fresh signal per command keeps saving and releasing after a slow handler", async () => {
    vi.stubGlobal("fetch", fakeUpstashFetch);
    const fixed = client(idempotencyRedisOptions(20));
    await expect(fixed.set("idem-lock:s:k", "1", { nx: true, ex: 60 })).resolves.toBe("OK");
    await sleep(60);
    await expect(fixed.set("idem:s:k", { status: 200, body: { id: "o1" } }, { ex: 60 })).resolves.toBe("OK");
    await expect(fixed.del("idem-lock:s:k")).resolves.toBe("OK");
  });

  it("each command still gets its own deadline", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init!.signal!);
      return fakeUpstashFetch(input, init);
    });
    const fixed = client(idempotencyRedisOptions(1_500));
    await fixed.get("a");
    await fixed.get("b");
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
  });
});
