import { describe, expect, it, vi } from "vitest";

import { sendDbHealthAlert } from "@/lib/db-health-alert";

describe("correo de la revisión de MySQL", () => {
  it("manda un correo con los avisos y no repite en las 20 h siguientes", async () => {
    const keys = new Set<string>();
    const redis = { set: vi.fn(async (key: string) => (keys.has(key) ? null : (keys.add(key), "OK"))) };
    const send = vi.fn(async () => ({ data: { id: "email-1" }, error: null }));

    expect(await sendDbHealthAlert(["El contenedor de MySQL usa 2355 MB."], "detalle", { redis, send })).toBe("sent");
    expect(redis.set).toHaveBeenCalledWith("monitor:db-health:container-alert", "1", { nx: true, ex: 20 * 3600 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
      subject: "⚠️ Memoria de MySQL alta",
      text: expect.stringContaining("El contenedor de MySQL usa 2355 MB."),
    }));

    expect(await sendDbHealthAlert(["otra vez"], "detalle", { redis, send })).toBe("cooldown");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("si Redis falla, avisa igual: un correo de más es mejor que ninguno", async () => {
    const redis = { set: vi.fn(async () => { throw new Error("redis down"); }) };
    const send = vi.fn(async () => ({ data: { id: "email-2" }, error: null }));
    expect(await sendDbHealthAlert(["aviso"], "detalle", { redis, send })).toBe("sent");
  });
});
