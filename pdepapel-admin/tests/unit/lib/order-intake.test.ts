import { beforeEach, describe, expect, it, vi } from "vitest";

const limits = vi.hoisted(() => vi.fn());
const priorFraud = vi.hoisted(() => vi.fn());
vi.mock("@/lib/order-rate-limit", () => ({ consumeOrderRateLimits: limits }));
vi.mock("@/lib/prismadb", () => ({ default: { order: { count: priorFraud } } }));
const turnstile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: turnstile }));

import { screenStoreOrder } from "@/lib/order-intake";
import { BOT_TRAP_ERROR, NAME_ERROR, PHONE_ERROR, RATE_LIMIT_ERROR, isFlagged } from "@/lib/order-risk";
import { setRateLimitRedis } from "@/lib/rate-limit";

const TURNSTILE_ERROR = "No pudimos confirmar que eres una persona.";

const NOW = Date.now();
const req = new Request("https://admin.example.com/api/s/checkout", { headers: { "x-forwarded-for": "203.0.113.9" } });
const base = {
  scope: "checkout" as const,
  storeId: "s-1",
  fullName: "María José Ñáñez",
  email: "maria.jose@gmail.com",
  phone: "300 123 4567",
  phoneRequired: true,
  honeypot: "",
  formStartedAt: NOW - 90_000,
};

beforeEach(() => {
  vi.restoreAllMocks();
  limits.mockReset();
  limits.mockResolvedValue({ allowed: true, repeated: false });
  priorFraud.mockReset();
  priorFraud.mockResolvedValue(0);
  turnstile.mockReset();
  turnstile.mockResolvedValue({ ok: true, status: "verified" });
});

describe("screenStoreOrder", () => {
  it("una clienta real pasa sin riesgo y con el celular normalizado", async () => {
    await expect(screenStoreOrder(req, base)).resolves.toEqual({ ok: true, phone: "+573001234567", risk: { riskScore: 0, riskReasons: null } });
    expect(limits).toHaveBeenCalledWith({ scope: "checkout", storeId: "s-1", clientKey: "203.0.113.9", email: "maria.jose@gmail.com", turnstileVerified: true });
  });

  it("la trampa llena o un envío instantáneo se rechazan sin gastar el límite", async () => {
    await expect(screenStoreOrder(req, { ...base, honeypot: "x" })).resolves.toEqual({ ok: false, status: 400, error: BOT_TRAP_ERROR });
    await expect(screenStoreOrder(req, { ...base, formStartedAt: NOW - 800 })).resolves.toEqual({ ok: false, status: 400, error: BOT_TRAP_ERROR });
    expect(limits).not.toHaveBeenCalled();
  });

  it("el patrón del bot de la tarjeta (celular +57 9…, nombre al azar) se rechaza con mensajes claros", async () => {
    await expect(screenStoreOrder(req, { ...base, phone: "+57 912 345 6789" })).resolves.toEqual({ ok: false, status: 400, error: PHONE_ERROR });
    await expect(screenStoreOrder(req, { ...base, fullName: "xKqPzLmWvB" })).resolves.toEqual({ ok: false, status: 400, error: NAME_ERROR });
  });

  it("sin teléfono solo pasa donde es opcional", async () => {
    await expect(screenStoreOrder(req, { ...base, phone: "" })).resolves.toMatchObject({ ok: false, error: PHONE_ERROR });
    await expect(screenStoreOrder(req, { ...base, phone: "", phoneRequired: false })).resolves.toMatchObject({ ok: true, phone: "" });
  });

  it("al pasar el límite responde 429", async () => {
    limits.mockResolvedValue({ allowed: false, repeated: true });
    await expect(screenStoreOrder(req, base)).resolves.toEqual({ ok: false, status: 429, error: RATE_LIMIT_ERROR });
  });

  it("rápido o repetido no se rechaza: queda marcado", async () => {
    limits.mockResolvedValue({ allowed: true, repeated: true });
    await expect(screenStoreOrder(req, { ...base, formStartedAt: NOW - 7_000 })).resolves.toEqual({
      ok: true,
      phone: "+573001234567",
      risk: { riskScore: 4, riskReasons: "envio-rapido,pedidos-repetidos" },
    });
  });

  it("un cliente sin el reloj del formulario (versión anterior de la tienda) pasa igual", async () => {
    await expect(screenStoreOrder(req, { ...base, formStartedAt: undefined, honeypot: undefined })).resolves.toMatchObject({ ok: true, risk: { riskScore: 0 } });
  });

  it("un correo o celular de un pedido cancelado como fraude marca el nuevo, sin rechazarlo", async () => {
    priorFraud.mockResolvedValue(1);
    await expect(screenStoreOrder(req, base)).resolves.toMatchObject({ ok: true, risk: { riskScore: 3, riskReasons: "fraude-previo" } });
    expect(priorFraud).toHaveBeenCalledWith({
      where: {
        storeId: "s-1",
        status: "CANCELLED",
        riskReasons: { contains: "fraude-confirmado" },
        OR: [{ email: "maria.jose@gmail.com" }, { phone: "+573001234567" }],
      },
    });
  });

  it("si la consulta falla no frena la venta", async () => {
    priorFraud.mockRejectedValue(new Error("sin base"));
    await expect(screenStoreOrder(req, base)).resolves.toMatchObject({ ok: true, risk: { riskScore: 0 } });
  });

  it.each([
    ["sin token", { ok: false, status: "missing", error: TURNSTILE_ERROR }, undefined],
    ["con el desafío fallido", { ok: false, status: "failed", error: TURNSTILE_ERROR }, "tok"],
  ])("%s el pedido pasa marcado «Posible bot», con el límite corto", async (_label, result, token) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    turnstile.mockResolvedValue(result);
    const screen = await screenStoreOrder(req, { ...base, turnstileToken: token });
    expect(screen).toEqual({ ok: true, phone: "+573001234567", risk: { riskScore: 2, riskReasons: "sin-turnstile" } });
    expect(isFlagged((screen as { risk: { riskScore: number } }).risk)).toBe(true);
    expect(turnstile).toHaveBeenCalledWith(token ?? null, "203.0.113.9");
    expect(limits).toHaveBeenCalledWith(expect.objectContaining({ turnstileVerified: false }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain("203.0.113.9");
    warn.mockRestore();
  });

  it("sin token y con envío rápido suma las dos señales", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    turnstile.mockResolvedValue({ ok: false, status: "missing", error: TURNSTILE_ERROR });
    await expect(screenStoreOrder(req, { ...base, formStartedAt: NOW - 7_000 })).resolves.toMatchObject({
      ok: true,
      risk: { riskScore: 4, riskReasons: "envio-rapido,sin-turnstile" },
    });
  });

  it.each(["unavailable", "not-configured"] as const)("Turnstile %s no marca el pedido ni acorta el límite", async (status) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    turnstile.mockResolvedValue({ ok: true, status });
    await expect(screenStoreOrder(req, { ...base, turnstileToken: "tok" })).resolves.toEqual({
      ok: true,
      phone: "+573001234567",
      risk: { riskScore: 0, riskReasons: null },
    });
    expect(limits).toHaveBeenCalledWith(expect.objectContaining({ turnstileVerified: true }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("el tercer pedido sin Turnstile desde la misma IP en una hora recibe 429; con token sigue el límite normal", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const actual = await vi.importActual<typeof import("@/lib/order-rate-limit")>("@/lib/order-rate-limit");
    limits.mockImplementation(actual.consumeOrderRateLimits);
    const counts = new Map<string, number>();
    setRateLimitRedis({
      incr: vi.fn(async (key: string) => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts.get(key)!;
      }),
      expire: vi.fn(async () => 1),
    } as never);
    try {
      turnstile.mockResolvedValue({ ok: false, status: "missing", error: TURNSTILE_ERROR });
      const emails = ["a@correo.co", "b@correo.co", "c@correo.co"];
      const results = [];
      for (const email of emails) results.push(await screenStoreOrder(req, { ...base, email }));
      expect(results.map((result) => result.ok)).toEqual([true, true, false]);
      expect(results[2]).toEqual({ ok: false, status: 429, error: RATE_LIMIT_ERROR });

      turnstile.mockResolvedValue({ ok: true, status: "verified" });
      await expect(screenStoreOrder(req, { ...base, email: "d@correo.co", turnstileToken: "tok" })).resolves.toMatchObject({ ok: true });
    } finally {
      setRateLimitRedis(null);
    }
  });
});
