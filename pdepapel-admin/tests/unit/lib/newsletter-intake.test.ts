import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NEWSLETTER_MIN_SUBMIT_MS, NEWSLETTER_RATE_LIMITS, screenNewsletterSignup } from "@/lib/newsletter-intake";
import { setRateLimitRedis } from "@/lib/rate-limit";

const NOW = 1_800_000_000_000;
const fetchMock = vi.fn();

/** Un contador por llave, como el INCR de Upstash. */
const fakeRedis = (down = false) => {
  const counters = new Map<string, number>();
  return {
    counters,
    client: {
      incr: vi.fn(async (key: string) => {
        if (down) throw new Error("Redis caído");
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return next;
      }),
      expire: vi.fn(async () => 1),
    } as never,
  };
};

const request = (ip = "203.0.113.9") => new Request("https://admin.test/api/s/newsletter/subscriptions", { method: "POST", headers: { "x-forwarded-for": ip } });
const input = (overrides: Record<string, unknown> = {}) => ({ storeId: "store-1", email: "cliente@example.com", formStartedAt: NOW - 8_000, ...overrides });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  setRateLimitRedis(fakeRedis().client);
});
afterEach(() => {
  setRateLimitRedis(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("filtro de las altas al boletín", () => {
  it("una persona que tarda unos segundos pasa", async () => {
    await expect(screenNewsletterSignup(request(), input(), NOW)).resolves.toEqual({ action: "accept" });
  });

  it.each([
    ["website", { website: "https://spam.test" }],
    ["company", { company: "ACME" }],
  ])("la trampa llena (%s) se descarta en silencio", async (_name, trap) => {
    await expect(screenNewsletterSignup(request(), input(trap), NOW)).resolves.toEqual({ action: "drop", reason: "honeypot" });
  });

  it("un envío en menos de 3 s, o sin reloj, se descarta en silencio", async () => {
    expect(NEWSLETTER_MIN_SUBMIT_MS).toBe(3_000);
    await expect(screenNewsletterSignup(request(), input({ formStartedAt: NOW - 2_999 }), NOW)).resolves.toEqual({ action: "drop", reason: "too_fast" });
    await expect(screenNewsletterSignup(request(), input({ formStartedAt: undefined }), NOW)).resolves.toEqual({ action: "drop", reason: "too_fast" });
    await expect(screenNewsletterSignup(request(), input({ formStartedAt: NOW - 3_000 }), NOW)).resolves.toEqual({ action: "accept" });
  });

  it("con clave de Turnstile, un desafío fallido o sin token no bloquea: se registra y siguen los límites", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    await expect(screenNewsletterSignup(request(), input({ turnstileToken: "malo" }), NOW)).resolves.toEqual({ action: "accept" });
    await expect(screenNewsletterSignup(request(), input({ turnstileToken: undefined, email: "otra@example.com" }), NOW)).resolves.toEqual({ action: "accept" });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("aunque Turnstile falle, la trampa, el reloj y el límite por IP siguen cortando", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    await expect(screenNewsletterSignup(request(), input({ website: "x" }), NOW)).resolves.toEqual({ action: "drop", reason: "honeypot" });
    await expect(screenNewsletterSignup(request(), input({ formStartedAt: NOW - 100 }), NOW)).resolves.toEqual({ action: "drop", reason: "too_fast" });
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await screenNewsletterSignup(request(), input({ email: `p${i}@example.com`, turnstileToken: undefined }), NOW));
    expect(results[5]).toEqual({ action: "drop", reason: "rate_ip" });
  });

  it("si Cloudflare no responde, se deja pasar", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("timeout"));
    await expect(screenNewsletterSignup(request(), input({ turnstileToken: "tok" }), NOW)).resolves.toEqual({ action: "accept" });
  });

  it("corta la sexta alta por IP en la hora, con correos distintos", async () => {
    expect(NEWSLETTER_RATE_LIMITS.perIp).toEqual({ limit: 5, windowSeconds: 3600 });
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await screenNewsletterSignup(request(), input({ email: `persona${i}@example.com` }), NOW));
    expect(results.slice(0, 5).every((result) => result.action === "accept")).toBe(true);
    expect(results[5]).toEqual({ action: "drop", reason: "rate_ip" });
  });

  it("corta la cuarta alta del mismo correo en 24 h, aunque cambien la IP y los puntos de Gmail", async () => {
    expect(NEWSLETTER_RATE_LIMITS.perEmail).toEqual({ limit: 3, windowSeconds: 86_400 });
    const variants = ["maria@gmail.com", "m.aria@gmail.com", "ma.ria+x@googlemail.com", "MARIA@gmail.com"];
    const results = [];
    for (let i = 0; i < variants.length; i++) results.push(await screenNewsletterSignup(request(`198.51.100.${i}`), input({ email: variants[i] }), NOW));
    expect(results.slice(0, 3).every((result) => result.action === "accept")).toBe(true);
    expect(results[3]).toEqual({ action: "drop", reason: "rate_email" });
  });

  it("las llaves de Redis no llevan ni la IP ni el correo legibles", async () => {
    const redis = fakeRedis();
    setRateLimitRedis(redis.client);
    await screenNewsletterSignup(request("203.0.113.77"), input({ email: "secreto@example.com" }), NOW);
    const keys = Array.from(redis.counters.keys()).join(" ");
    expect(keys).not.toContain("203.0.113.77");
    expect(keys).not.toContain("secreto");
  });

  it("si Redis no responde, se deja pasar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setRateLimitRedis(fakeRedis(true).client);
    for (let i = 0; i < 8; i++) {
      await expect(screenNewsletterSignup(request(), input(), NOW)).resolves.toEqual({ action: "accept" });
    }
  });
});
