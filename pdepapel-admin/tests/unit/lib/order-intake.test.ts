import { beforeEach, describe, expect, it, vi } from "vitest";

const limits = vi.hoisted(() => vi.fn());
vi.mock("@/lib/order-rate-limit", () => ({ consumeOrderRateLimits: limits }));

import { screenStoreOrder } from "@/lib/order-intake";
import { BOT_TRAP_ERROR, NAME_ERROR, PHONE_ERROR, RATE_LIMIT_ERROR } from "@/lib/order-risk";

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
  limits.mockReset();
  limits.mockResolvedValue({ allowed: true, repeated: false });
});

describe("screenStoreOrder", () => {
  it("una clienta real pasa sin riesgo y con el celular normalizado", async () => {
    await expect(screenStoreOrder(req, base)).resolves.toEqual({ ok: true, phone: "+573001234567", risk: { riskScore: 0, riskReasons: null } });
    expect(limits).toHaveBeenCalledWith({ scope: "checkout", storeId: "s-1", clientKey: "203.0.113.9", email: "maria.jose@gmail.com" });
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
});
