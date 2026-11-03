import { describe, expect, it, vi } from "vitest";

import { alertEnvioClickCreditExhausted, isInsufficientCreditError } from "@/lib/envioclick-credit-alert";

// El texto real que devolvió EnvioClick el 2026-11-03 (sin datos de la clienta).
const REAL_ERROR = new Error(
  'EnvioClick API Error: NOT OK. Details: {"error":["Unprocessed Entity.","No tiene suficiente crédito disponible en su cuenta. Necesita hacer un depósito en www.envioclickpro.com.co"]}',
);

const okPush = async (_storeId: string, _payload: unknown) => ({ configured: true, devices: 1, delivered: 1, removed: 0, failed: 0 });

describe("aviso de EnvioClick sin saldo", () => {
  it("reconoce el error de saldo y no otros errores de la guía", () => {
    expect(isInsufficientCreditError(REAL_ERROR)).toBe(true);
    expect(isInsufficientCreditError("saldo insuficiente")).toBe(true);
    expect(isInsufficientCreditError(new Error("La cotización de envío ha expirado o es inválida"))).toBe(false);
    expect(isInsufficientCreditError(undefined)).toBe(false);
  });

  it("avisa por push con la referencia del pedido y nada de la clienta", async () => {
    const push = vi.fn(okPush);
    const result = await alertEnvioClickCreditExhausted(
      { storeId: "store-1", orderId: "order-1", orderNumber: "ORD-1" },
      { enabled: true, claim: async () => true, push },
    );
    expect(result).toBe("sent");
    expect(push).toHaveBeenCalledTimes(1);
    const [storeId, payload] = push.mock.calls[0] as unknown as [string, { title: string; body: string; url: string; tag: string }];
    expect(storeId).toBe("store-1");
    expect(payload.title).toBe("EnvioClick sin saldo");
    expect(payload.body).toContain("ORD-1");
    expect(payload.url).toBe("/store-1/pedidos/order-1");
    expect(payload.tag).toBe("envioclick-credito");
    expect(JSON.stringify(payload)).not.toMatch(/@|\+?57\d{7,}|calle|carrera/i);
  });

  it("uno por tienda y por día de Bogotá", async () => {
    const claimed = new Set<string>();
    const claim = vi.fn(async (key: string) => (claimed.has(key) ? false : (claimed.add(key), true)));
    const push = vi.fn(okPush);
    const deps = { enabled: true, claim, push };
    const late = new Date("2026-11-04T04:30:00Z"); // 23:30 del 3 en Bogotá
    expect(await alertEnvioClickCreditExhausted({ storeId: "s", orderId: "a", orderNumber: "A" }, { ...deps, now: late })).toBe("sent");
    expect(await alertEnvioClickCreditExhausted({ storeId: "s", orderId: "b", orderNumber: "B" }, { ...deps, now: late })).toBe("cooldown");
    expect(await alertEnvioClickCreditExhausted({ storeId: "s", orderId: "c", orderNumber: "C" }, { ...deps, now: new Date("2026-11-04T06:00:00Z") })).toBe("sent");
    expect(claim.mock.calls.map((call) => call[0])).toEqual([
      "alert:envioclick-credit:s:2026-11-03",
      "alert:envioclick-credit:s:2026-11-03",
      "alert:envioclick-credit:s:2026-11-04",
    ]);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("fuera de producción no sale nada, y un fallo del aviso no se propaga", async () => {
    const push = vi.fn(okPush);
    expect(await alertEnvioClickCreditExhausted({ storeId: "s", orderId: "a", orderNumber: "A" }, { push })).toBe("skipped");
    expect(push).not.toHaveBeenCalled();
    const failing = await alertEnvioClickCreditExhausted(
      { storeId: "s", orderId: "a", orderNumber: "A" },
      { enabled: true, claim: async () => { throw new Error("redis caído"); }, push },
    );
    expect(failing).toBe("failed");
  });
});
