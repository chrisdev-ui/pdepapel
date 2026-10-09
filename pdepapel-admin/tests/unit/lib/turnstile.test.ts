import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TURNSTILE_ERROR, verifyTurnstile } from "@/lib/turnstile";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const reply = (body: unknown) => ({ ok: true, json: async () => body });

describe("verifyTurnstile", () => {
  it("sin la clave secreta no hace nada: la tienda sigue vendiendo antes de crear las claves", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    await expect(verifyTurnstile(undefined, "203.0.113.9")).resolves.toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con la clave, un pedido sin token se rechaza con un mensaje claro", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    await expect(verifyTurnstile("", "203.0.113.9")).resolves.toEqual({ ok: false, error: TURNSTILE_ERROR });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifica el token con Cloudflare una vez y acepta el de la tienda", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    fetchMock.mockResolvedValue(reply({ success: true, hostname: "papeleriapdepapel.com" }));
    await expect(verifyTurnstile("tok-1", "203.0.113.9")).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const sent = new URLSearchParams(init.body as string);
    expect(sent.get("secret")).toBe("secreto");
    expect(sent.get("response")).toBe("tok-1");
    expect(sent.get("remoteip")).toBe("203.0.113.9");
  });

  it("rechaza un token inválido, vencido o de otro sitio en producción", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    fetchMock.mockResolvedValue(reply({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    await expect(verifyTurnstile("tok-2", "x")).resolves.toEqual({ ok: false, error: TURNSTILE_ERROR });

    vi.stubEnv("VERCEL_ENV", "production");
    fetchMock.mockResolvedValue(reply({ success: true, hostname: "sitio-ajeno.com" }));
    await expect(verifyTurnstile("tok-3", "x")).resolves.toEqual({ ok: false, error: TURNSTILE_ERROR });
    fetchMock.mockResolvedValue(reply({ success: true, hostname: "www.papeleriapdepapel.com" }));
    await expect(verifyTurnstile("tok-4", "x")).resolves.toEqual({ ok: true });
  });

  it("si Cloudflare no responde deja pasar (igual que el límite de pedidos) y lo registra", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(verifyTurnstile("tok-5", "x")).resolves.toEqual({ ok: true });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
