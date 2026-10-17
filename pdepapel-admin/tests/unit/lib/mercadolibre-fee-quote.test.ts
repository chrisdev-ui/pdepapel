import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** El camino del Copiloto a la comisión real nunca escribe en la base ni registra el token. */
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  refresh: vi.fn(),
  markReauth: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: { marketplaceConnection: { findUnique: mocks.findUnique, findUniqueOrThrow: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany } },
}));
vi.mock("@/lib/mercadolibre/config", () => ({ getMercadoLibreConfig: () => ({ tokenEncryptionKey: "clave-de-prueba" }) }));
vi.mock("@/lib/mercadolibre/crypto", () => ({ decryptMercadoLibreToken: () => "TOKEN-SECRETO-DE-PRUEBA", encryptMercadoLibreToken: (value: string) => value }));
vi.mock("@/lib/mercadolibre/oauth", () => ({ refreshMercadoLibreAccessToken: mocks.refresh, MercadoLibreApiError: class extends Error {} }));
vi.mock("@/lib/mercadolibre/reauth-notice", () => ({ notifyMercadoLibreReauthRequired: mocks.markReauth }));

import { quoteMercadoLibreSaleFee } from "@/lib/mercadolibre/fee-quote";

const connection = (expiresInMs: number) => ({ status: "CONNECTED", encryptedAccessToken: "cifrado", accessTokenExpiresAt: new Date(Date.now() + expiresInMs) });
let price = 40000;
const request = () => ({ connectionId: "conn-1", siteId: "MCO", categoryId: "MCO1", listingType: "gold_pro", price: price++ });
const fetchSpy = vi.fn();
const logs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  logs.length = 0;
  vi.stubGlobal("fetch", fetchSpy);
  for (const level of ["log", "info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const noWrites = () => {
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.markReauth).not.toHaveBeenCalled();
};

describe("comisión real para el Copiloto", () => {
  it("con el token vencido (o por vencer) no lo renueva, no escribe y no llama a Mercado Libre: devuelve null y se usa el estimado", async () => {
    for (const expiresInMs of [-60_000, 30_000]) {
      mocks.findUnique.mockResolvedValueOnce(connection(expiresInMs));
      await expect(quoteMercadoLibreSaleFee(request())).resolves.toBeNull();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    noWrites();
  });

  it("sin token o con la conexión sin conectar, lo mismo", async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...connection(3_600_000), encryptedAccessToken: null });
    await expect(quoteMercadoLibreSaleFee(request())).resolves.toBeNull();
    mocks.findUnique.mockResolvedValueOnce({ ...connection(3_600_000), status: "REAUTH_REQUIRED" });
    await expect(quoteMercadoLibreSaleFee(request())).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    noWrites();
  });

  it("un 401 de Mercado Libre no renueva ni marca la conexión: null", async () => {
    mocks.findUnique.mockResolvedValueOnce(connection(3_600_000));
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(quoteMercadoLibreSaleFee(request())).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    noWrites();
  });

  it("con token vigente devuelve el porcentaje y la parte fija de la comisión", async () => {
    mocks.findUnique.mockResolvedValueOnce(connection(3_600_000));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ listing_type_id: "gold_pro", sale_fee_amount: 7600, sale_fee_details: { percentage_fee: 19, fixed_fee: 0 } }), { status: 200 }));
    await expect(quoteMercadoLibreSaleFee(request())).resolves.toEqual({ kind: "real", percentageFee: 19, fixedFee: 0, listingType: "gold_pro" });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/sites/MCO/listing_prices?price=");
    expect((init as RequestInit).headers).toEqual({ Authorization: "Bearer TOKEN-SECRETO-DE-PRUEBA" });
    noWrites();
  });

  it("si la llamada falla o se demora, null; y el token nunca aparece en lo que se registra", async () => {
    mocks.findUnique.mockResolvedValueOnce(connection(3_600_000));
    fetchSpy.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
    await expect(quoteMercadoLibreSaleFee(request())).resolves.toBeNull();
    expect(logs.some((line) => line.includes("[ML_FEE_QUOTE]"))).toBe(true);
    expect(logs.join("\n")).not.toContain("TOKEN-SECRETO-DE-PRUEBA");
    noWrites();
  });
});
