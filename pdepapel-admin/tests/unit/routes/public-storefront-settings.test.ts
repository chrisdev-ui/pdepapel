import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findStore: vi.fn(), findSettings: vi.fn() }));

vi.mock("@/lib/prismadb", () => ({
  default: {
    store: { findUnique: mocks.findStore },
    storeSettings: { findUnique: mocks.findSettings },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: {
    SEMI_STATIC: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  },
}));

import { GET, OPTIONS } from "@/app/api/[storeId]/public/storefront/route";

const request = (origin = "https://papeleriapdepapel.com") =>
  new Request("https://admin.example.com/api/store-1/public/storefront", {
    headers: { Origin: origin },
  });

let errorSpy: ReturnType<typeof vi.spyOn>;

describe("public storefront settings endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSettings.mockResolvedValue(null);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("exposes only the free-shipping threshold and store name, with CORS and caching", async () => {
    mocks.findStore.mockResolvedValue({
      id: "store-1",
      name: "P de Papel",
      freeShippingThreshold: 120000,
      userId: "user-secret",
      email: "owner@example.com",
    });

    const response = await GET(request(), { params: { storeId: "store-1" } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      storeId: "store-1",
      name: "P de Papel",
      freeShippingThreshold: 120000,
      // Datos del negocio: sin fila guardada salen vacíos y la tienda usa sus
      // textos de siempre.
      openingHoursLabel: null,
      cityName: null,
      hasPhysicalStore: false,
      physicalAddress: null,
      deliveryEstimate: null,
      bankTransfer: { account: null, breBKey: null, whatsappNumber: null },
    });
    // Sin datos de pago en Configuración se dice fuerte en los registros (solo nombres de campo).
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/\[BANK_TRANSFER_INFO\].*account, breBKey, whatsappNumber/));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(mocks.findStore).toHaveBeenCalledWith({
      where: { id: "store-1" },
      select: { id: true, name: true, freeShippingThreshold: true },
    });
  });

  it("reports a disabled threshold as null", async () => {
    mocks.findStore.mockResolvedValue({
      id: "store-1",
      name: "P de Papel",
      freeShippingThreshold: null,
    });

    const response = await GET(request(), { params: { storeId: "store-1" } });

    await expect(response.json()).resolves.toMatchObject({
      freeShippingThreshold: null,
    });
  });

  it("returns 404 for an unknown store and answers preflight", async () => {
    mocks.findStore.mockResolvedValue(null);

    const response = await GET(request(), { params: { storeId: "nope" } });
    expect(response.status).toBe(404);

    const preflight = await OPTIONS(request());
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, OPTIONS",
    );
  });

  it("publica los datos de transferencia de Configuración (los mismos que /pedido muestra) y no avisa si están completos", async () => {
    mocks.findStore.mockResolvedValue({ id: "store-1", name: "P de Papel", freeShippingThreshold: null });
    mocks.findSettings.mockResolvedValue({
      paymentBancolombiaAccount: " Ahorros Banco Prueba 000-TEST-00 ",
      paymentBreBKey: "@llave-de-prueba",
      whatsappNumber: "573000000000",
      paymentNequiNumber: "3000000001",
      botHoldingText: "privado",
    });

    const json = await (await GET(request(), { params: { storeId: "store-1" } })).json();

    expect(json.bankTransfer).toEqual({ account: "Ahorros Banco Prueba 000-TEST-00", breBKey: "@llave-de-prueba", whatsappNumber: "573000000000" });
    expect(JSON.stringify(json)).not.toContain("3000000001");
    expect(JSON.stringify(json)).not.toContain("privado");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
