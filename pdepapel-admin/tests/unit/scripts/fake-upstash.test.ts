import { readFileSync } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findProductionLeaks } from "../../../scripts/lib/e2e-production-leaks.mjs";
import { startFakeUpstash, withFakeUpstash } from "../../../scripts/lib/fake-upstash.mjs";

/**
 * El Redis falso de las e2e responde como Upstash (con base64, como pide el
 * cliente), así la caché, la idempotencia y los límites funcionan sin red.
 */
const root = path.resolve(__dirname, "../../..");
let fake: Awaited<ReturnType<typeof startFakeUpstash>>;
let redis: Redis;

beforeAll(async () => {
  fake = await startFakeUpstash();
  redis = new Redis({ url: fake.url, token: "test-stub" });
});
afterAll(() => fake.close());

describe("Upstash falso de las e2e", () => {
  it("guarda y devuelve objetos con acentos, respeta NX y lleva la cuenta de INCR", async () => {
    await redis.set("store:t:a", { n: 1, s: "ñandú" }, { ex: 60 });
    expect(await redis.get("store:t:a")).toEqual({ n: 1, s: "ñandú" });
    expect(await redis.set("lock:t", "1", { nx: true, ex: 60 })).toBe("OK");
    expect(await redis.set("lock:t", "1", { nx: true, ex: 60 })).toBeNull();
    expect([await redis.incr("rl:t"), await redis.incr("rl:t")]).toEqual([1, 2]);
    expect(await redis.expire("rl:t", 60)).toBe(1);
  });

  it("tuberías, SCAN con patrón y DEL", async () => {
    const pipeline = redis.pipeline();
    pipeline.get("store:t:a");
    pipeline.incr("rl:t");
    expect(await pipeline.exec()).toEqual([{ n: 1, s: "ñandú" }, 3]);
    expect(await redis.scan(0, { match: "store:t:*", count: 100 })).toEqual(["0", ["store:t:a"]]);
    expect(await redis.del("store:t:a")).toBe(1);
    expect(await redis.get("store:t:a")).toBeNull();
  });

  it("la URL es local: pasa el corte de red y la revisión de producción", () => {
    const env = withFakeUpstash({ UPSTASH_REDIS_REST_URL: "https://upstash.stub.invalid" }, fake.url);
    expect(env.UPSTASH_REDIS_REST_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(env.KV_REST_API_URL).toBe(env.UPSTASH_REDIS_REST_URL);
    expect(findProductionLeaks(env)).toEqual([]);
  });

  it("los dos servidores de las e2e arrancan con el Redis falso", () => {
    for (const file of ["scripts/e2e-dev-server.mjs", "scripts/e2e-production-server.mjs"]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source, file).toContain("await startFakeUpstash()");
      expect(source, file).toContain("withFakeUpstash(");
    }
  });
});
