import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consumeRateLimit,
  getClientKey,
  setRateLimitRedis,
} from "@/lib/rate-limit";

const fakeRedis = (counter: { value: number }, falla = false) =>
  ({
    incr: vi.fn(async () => {
      if (falla) throw new Error("Redis caído");
      counter.value += 1;
      return counter.value;
    }),
    expire: vi.fn(async () => 1),
  }) as never;

afterEach(() => setRateLimitRedis(null));

describe("límite por ventana fija", () => {
  it("deja pasar hasta el tope y corta después", async () => {
    const counter = { value: 0 };
    setRateLimitRedis(fakeRedis(counter));

    const intentos = [];
    for (let i = 0; i < 4; i++) {
      intentos.push(
        await consumeRateLimit({ key: "k", limit: 3, windowSeconds: 60 }),
      );
    }

    expect(intentos.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(intentos[2].remaining).toBe(0);
    expect(intentos[3].retryAfterSeconds).toBe(60);
  });

  it("si Redis no responde, se deja pasar: nunca se pierde una venta", async () => {
    setRateLimitRedis(fakeRedis({ value: 0 }, true));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      consumeRateLimit({ key: "k", limit: 1, windowSeconds: 60 }),
    ).resolves.toMatchObject({ allowed: true });

    logged.mockRestore();
  });
});

describe("de quién viene la petición", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://admin.test/x", { headers });

  it("toma la primera IP de x-forwarded-for", () => {
    expect(getClientKey(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe(
      "1.2.3.4",
    );
  });

  it("cae a x-real-ip y luego a un valor fijo", () => {
    expect(getClientKey(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(getClientKey(req({}))).toBe("desconocida");
  });
});
