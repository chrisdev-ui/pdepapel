import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readIdempotencyKey,
  setIdempotencyRedis,
  withIdempotency,
} from "@/lib/idempotency";

class FakeRedis {
  store = new Map<string, unknown>();
  get = vi.fn(async (key: string) => this.store.get(key) ?? null);
  set = vi.fn(async (key: string, value: unknown, options?: { nx?: boolean }) => {
    if (options?.nx && this.store.has(key)) return null;
    this.store.set(key, value);
    return "OK";
  });
  del = vi.fn(async (key: string) => {
    this.store.delete(key);
    return 1;
  });
}

const request = (key?: string) =>
  new Request("https://admin.test/api/store/orders", {
    method: "POST",
    headers: key ? { "Idempotency-Key": key } : undefined,
  });

describe("readIdempotencyKey", () => {
  it("acepta claves seguras y rechaza el resto", () => {
    expect(readIdempotencyKey(request("a1b2c3d4-e5f6"))).toBe("a1b2c3d4-e5f6");
    expect(readIdempotencyKey(request("short"))).toBeNull();
    expect(readIdempotencyKey(request("bad key!"))).toBeNull();
    expect(readIdempotencyKey(request())).toBeNull();
  });
});

describe("withIdempotency", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
    setIdempotencyRedis(redis as never);
  });

  it("ejecuta el handler sin clave", async () => {
    const handler = vi.fn(async () => NextResponse.json({ id: "o1" }));
    const response = await withIdempotency(request(), "store", handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ id: "o1" });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("repite la misma respuesta ante la misma clave sin volver a crear", async () => {
    const handler = vi.fn(async () => NextResponse.json({ id: "o1" }, { status: 200 }));
    const first = await withIdempotency(request("abcdefgh-1"), "store", handler);
    const second = await withIdempotency(request("abcdefgh-1"), "store", handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(await first.json()).toEqual({ id: "o1" });
    expect(await second.json()).toEqual({ id: "o1" });
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(redis.store.has("idem-lock:store:abcdefgh-1")).toBe(false);
  });

  it("no guarda respuestas de error para permitir reintentar", async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(NextResponse.json({ error: "x" }, { status: 500 }))
      .mockResolvedValueOnce(NextResponse.json({ id: "o2" }));
    await withIdempotency(request("abcdefgh-2"), "store", handler);
    const retry = await withIdempotency(request("abcdefgh-2"), "store", handler);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(await retry.json()).toEqual({ id: "o2" });
  });

  it("responde 409 mientras la primera petición sigue en curso", async () => {
    redis.store.set("idem-lock:store:abcdefgh-3", "1");
    const handler = vi.fn(async () => NextResponse.json({ id: "o3" }));
    const response = await withIdempotency(request("abcdefgh-3"), "store", handler);
    expect(response.status).toBe(409);
    expect(handler).not.toHaveBeenCalled();
  });

  it("libera el bloqueo si el handler lanza", async () => {
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(
      withIdempotency(request("abcdefgh-4"), "store", handler),
    ).rejects.toThrow("boom");
    expect(redis.store.has("idem-lock:store:abcdefgh-4")).toBe(false);
  });

  it("sigue creando pedidos si Redis falla", async () => {
    redis.get.mockRejectedValueOnce(new Error("down"));
    const handler = vi.fn(async () => NextResponse.json({ id: "o5" }));
    const response = await withIdempotency(request("abcdefgh-5"), "store", handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ id: "o5" });
  });
});
