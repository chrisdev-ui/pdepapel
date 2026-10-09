import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  notify: vi.fn(),
  tokenFetch: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: { marketplaceConnection: { findUniqueOrThrow: mocks.findUniqueOrThrow, updateMany: mocks.updateMany, update: mocks.update } },
}));
vi.mock("@/lib/mercadolibre/config", () => ({
  getMercadoLibreConfig: () => ({ clientId: "id", clientSecret: "x", tokenEncryptionKey: "k", redirectUri: "r" }),
  getMercadoLibreConfigurationStatus: () => ({ configured: true }),
}));
vi.mock("@/lib/mercadolibre/crypto", () => ({
  decryptMercadoLibreToken: (value: string) => value.replace("enc:", ""),
  encryptMercadoLibreToken: (value: string) => `enc:${value}`,
}));
vi.mock("@/lib/mercadolibre/reauth-notice", () => ({ notifyMercadoLibreReauthRequired: mocks.notify }));

import { handleErrorResponse } from "@/lib/api-errors";
import {
  MERCADOLIBRE_RECONNECT_MESSAGE,
  MercadoLibreReauthError,
  getMercadoLibreAccessToken,
  getMercadoLibreJson,
  mutateMercadoLibreJson,
} from "@/lib/mercadolibre/client";

const connection = (extra: Record<string, unknown> = {}) => ({
  id: "c1",
  status: "CONNECTED",
  encryptedAccessToken: "enc:viejo",
  encryptedRefreshToken: "enc:refresh",
  accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
  tokenVersion: 1,
  ...extra,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUniqueOrThrow.mockResolvedValue(connection());
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue({});
  vi.stubGlobal("fetch", mocks.tokenFetch);
});

describe("token de Mercado Libre", () => {
  it("un refresh rechazado (invalid_grant) marca «Requiere reconexión», avisa una vez y lo dice en español", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue(connection({ accessTokenExpiresAt: new Date(Date.now() - 1000) }));
    mocks.tokenFetch.mockResolvedValue(json(400, { error: "invalid_grant", message: "invalid_grant" }));

    const error = await getMercadoLibreAccessToken("c1").catch((caught) => caught);

    expect(error).toBeInstanceOf(MercadoLibreReauthError);
    expect(error.message).toBe(MERCADOLIBRE_RECONNECT_MESSAGE);
    expect(MERCADOLIBRE_RECONNECT_MESSAGE).toBe("La conexión con Mercado Libre se venció. Pídele a Christian que la reconecte.");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", status: "CONNECTED" },
      data: { status: "REAUTH_REQUIRED", lastError: MERCADOLIBRE_RECONNECT_MESSAGE },
    });
    expect(mocks.notify).toHaveBeenCalledWith("c1");

    const response = handleErrorResponse(error, "TEST");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: MERCADOLIBRE_RECONNECT_MESSAGE });
  });

  it("si otra llamada ya la marcó, no vuelve a avisar", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue(connection({ accessTokenExpiresAt: new Date(Date.now() - 1000) }));
    mocks.tokenFetch.mockResolvedValue(json(401, { error: "invalid_token" }));
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(getMercadoLibreAccessToken("c1")).rejects.toBeInstanceOf(MercadoLibreReauthError);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("una conexión que ya requiere reconexión falla al instante con el mismo mensaje, sin llamar a Mercado Libre", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue(connection({ status: "REAUTH_REQUIRED" }));
    const error = await getMercadoLibreAccessToken("c1").catch((caught) => caught);
    expect(error).toBeInstanceOf(MercadoLibreReauthError);
    expect(error.message).toBe(MERCADOLIBRE_RECONNECT_MESSAGE);
    expect(mocks.tokenFetch).not.toHaveBeenCalled();
  });

  it("un error de red al renovar no pide reconectar: se puede reintentar", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue(connection({ accessTokenExpiresAt: new Date(Date.now() - 1000) }));
    mocks.tokenFetch.mockResolvedValue(json(503, { message: "unavailable" }));
    const error = await getMercadoLibreAccessToken("c1").catch((caught) => caught);
    expect(error).not.toBeInstanceOf(MercadoLibreReauthError);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("un 401 renueva el token una sola vez y repite la llamada", async () => {
    mocks.tokenFetch
      .mockResolvedValueOnce(json(401, { message: "invalid access token" }))
      .mockResolvedValueOnce(json(200, { access_token: "nuevo", refresh_token: "refresh2", expires_in: 21600 }))
      .mockResolvedValueOnce(json(200, { id: "MCO1" }));

    await expect(getMercadoLibreJson("c1", "/items/MCO1")).resolves.toEqual({ id: "MCO1" });

    const calls = mocks.tokenFetch.mock.calls;
    expect(calls).toHaveLength(3);
    expect(String(calls[1][0])).toContain("/oauth/token");
    expect(calls[2][1].headers.Authorization).toBe("Bearer nuevo");
  });

  it("si después de renovar sigue en 401, se detiene y pide reconectar (sin bucle)", async () => {
    mocks.tokenFetch
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { access_token: "nuevo", refresh_token: "refresh2", expires_in: 21600 }))
      .mockResolvedValueOnce(json(401, {}));

    const error = await mutateMercadoLibreJson("c1", "/items/MCO1", { method: "PUT", body: { available_quantity: 2 } }).catch((caught) => caught);
    expect(error).toBeInstanceOf(MercadoLibreReauthError);
    expect(mocks.tokenFetch).toHaveBeenCalledTimes(3);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REAUTH_REQUIRED" }) }));
  });

  it("si otra llamada ya renovó el token mientras tanto, usa ese y no gasta el refresh de un solo uso", async () => {
    mocks.findUniqueOrThrow
      .mockResolvedValueOnce(connection())
      .mockResolvedValueOnce(connection({ encryptedAccessToken: "enc:renovado-por-otra", tokenVersion: 2 }));
    mocks.tokenFetch.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(200, { ok: true }));

    await expect(getMercadoLibreJson("c1", "/items/MCO1")).resolves.toEqual({ ok: true });
    expect(mocks.tokenFetch).toHaveBeenCalledTimes(2);
    expect(mocks.tokenFetch.mock.calls[1][1].headers.Authorization).toBe("Bearer renovado-por-otra");
  });

  it("un 429 espera lo que pide Mercado Libre y repite, sin renovar el token", async () => {
    vi.useFakeTimers();
    try {
      mocks.tokenFetch
        .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "2" } }))
        .mockResolvedValueOnce(json(200, { id: "MCO1" }));
      const pending = getMercadoLibreJson("c1", "/items/MCO1");
      await vi.advanceTimersByTimeAsync(1_999);
      expect(mocks.tokenFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ id: "MCO1" });
      expect(mocks.tokenFetch).toHaveBeenCalledTimes(2);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("tras dos esperas devuelve el 429 a quien llamó, que decide reintentar después", async () => {
    vi.useFakeTimers();
    try {
      mocks.tokenFetch.mockResolvedValue(new Response("{}", { status: 429 }));
      const pending = mutateMercadoLibreJson("c1", "/items/MCO1", { method: "PUT", body: { available_quantity: 1 } }).catch((caught: Error) => caught);
      await vi.advanceTimersByTimeAsync(20_000);
      const error = await pending;
      expect(mocks.tokenFetch).toHaveBeenCalledTimes(3);
      expect(String((error as Error).message)).toMatch(/Mercado Libre/);
    } finally {
      vi.useRealTimers();
    }
  });
});
