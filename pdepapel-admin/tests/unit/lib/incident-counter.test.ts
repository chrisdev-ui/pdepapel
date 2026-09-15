import { beforeEach, describe, expect, it, vi } from "vitest";

import { countIncident, setIncidentCounterRedis } from "@/lib/incident-counter";

const cliente = (impl: { incr?: unknown; expire?: unknown } = {}) =>
  ({
    incr: impl.incr ?? vi.fn().mockResolvedValue(1),
    expire: impl.expire ?? vi.fn().mockResolvedValue(1),
  }) as never;

describe("contar lo que no debería repetirse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("la primera vez cuenta y pone caducidad a la ventana", async () => {
    const expire = vi.fn().mockResolvedValue(1);
    setIncidentCounterRedis(cliente({ incr: vi.fn().mockResolvedValue(1), expire }));
    const r = await countIncident({ kind: "prueba", threshold: 10, windowSeconds: 3600 });
    expect(r).toEqual({ count: 1, alerted: false });
    expect(expire).toHaveBeenCalledWith(expect.stringContaining("incident:prueba:"), 7200);
  });

  it("por debajo del umbral no grita", async () => {
    setIncidentCounterRedis(cliente({ incr: vi.fn().mockResolvedValue(9) }));
    const r = await countIncident({ kind: "prueba", threshold: 10, windowSeconds: 3600 });
    expect(r.alerted).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("AL CRUZAR el umbral escribe la línea de alerta, con contexto", async () => {
    setIncidentCounterRedis(cliente({ incr: vi.fn().mockResolvedValue(10) }));
    const r = await countIncident({
      kind: "checkout_shipping_rate_recovery",
      threshold: 10,
      windowSeconds: 3600,
      context: { daneCode: "05045000" },
    });
    expect(r.alerted).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("🚨 [ALERTA] checkout_shipping_rate_recovery"),
      expect.objectContaining({ count: 10, daneCode: "05045000" }),
    );
  });

  it("solo grita UNA vez por ventana, no en cada una a partir de ahí", async () => {
    setIncidentCounterRedis(cliente({ incr: vi.fn().mockResolvedValue(11) }));
    const r = await countIncident({ kind: "prueba", threshold: 10, windowSeconds: 3600 });
    expect(r.alerted).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("si Redis falla, NO se lleva por delante la compra", async () => {
    setIncidentCounterRedis(
      cliente({ incr: vi.fn().mockRejectedValue(new Error("redis caído")) }),
    );
    await expect(
      countIncident({ kind: "prueba", threshold: 10, windowSeconds: 3600 }),
    ).resolves.toEqual({ count: 0, alerted: false });
  });
});
