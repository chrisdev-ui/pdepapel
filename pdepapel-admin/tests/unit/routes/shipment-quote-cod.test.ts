import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /shipment/quote con «Pago contra entrega» (2026-10-15): manda el recaudo a
 * EnvioClick, devuelve lo que cobra por recaudar, no guarda la respuesta en la
 * caché y deja una línea de registro sin la dirección para poder ver qué
 * respondió EnvioClick.
 */
const mocks = vi.hoisted(() => ({ quoteShipment: vi.fn(), upsert: vi.fn(), log: vi.spyOn(console, "log") }));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: vi.fn().mockResolvedValue([]) },
    box: { findMany: vi.fn().mockResolvedValue([]) },
    shippingQuote: { findUnique: vi.fn().mockResolvedValue(null), upsert: mocks.upsert, update: vi.fn(), deleteMany: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("@/lib/envioclick", () => ({ envioClickClient: { quoteShipment: mocks.quoteShipment } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true }), getClientKey: () => "test" }));

import { POST } from "@/app/api/[storeId]/shipment/quote/route";

const ADDRESS = "Calle 1 # 2-3";
const request = (isCOD: boolean) =>
  new Request("https://admin.test/api/store-1/shipment/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ destination: { daneCode: "17380000", address: ADDRESS }, orderTotal: 52000, items: [{ productId: "MAN-1", name: "Libreta", quantity: 1, price: 52000 }], forceRefresh: true, isCOD }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.quoteShipment.mockResolvedValue({
    data: {
      packages: [],
      idCarriersNoWsResult: [],
      rates: [
        { idRate: 1, idCarrier: 2, idProduct: 3, carrier: "ENVIA", product: "Normal", flete: 17000, minimumInsurance: 1000, deliveryDays: 3, cod: true, codDetails: { codCost: 7000, codCostWithInsurance: 7500, codPaymentMethod: "cash", includeGuideCost: false } },
        { idRate: 2, idCarrier: 4, idProduct: 5, carrier: "COORDINADORA", product: "Normal", flete: 16000, minimumInsurance: 900, deliveryDays: 4, cod: false, codDetails: null },
      ],
    },
  });
});

describe("POST /shipment/quote", () => {
  it("contra entrega: manda el recaudo, trae lo que cobra EnvioClick y lo registra sin la dirección", async () => {
    const response = await POST(request(true), { params: { storeId: "store-1" } });
    expect(response.status).toBe(200);

    expect(mocks.quoteShipment).toHaveBeenCalledWith(expect.objectContaining({ codValue: 52000, codPaymentMethod: "cash", includeGuideCost: false }));
    const { quotes } = await response.json();
    expect(quotes.map(({ carrier, isCOD, codCost, totalCost }: Record<string, unknown>) => ({ carrier, isCOD, codCost, totalCost }))).toEqual([
      { carrier: "ENVIA", isCOD: true, codCost: 7000, totalCost: 18000 },
      { carrier: "COORDINADORA", isCOD: false, codCost: null, totalCost: 16900 },
    ]);
    expect(mocks.upsert).not.toHaveBeenCalled();

    const line = mocks.log.mock.calls.find(([tag]) => tag === "[SHIPPING_QUOTE] contra entrega");
    expect(line).toBeDefined();
    expect(JSON.parse(String(line![1]))).toMatchObject({ destDaneCode: "17380000", rates: [{ carrier: "ENVIA", cod: true, codCost: 7000 }, { carrier: "COORDINADORA", cod: false, codCost: null }] });
    expect(String(line![1])).not.toContain(ADDRESS);
  });

  it("sin contra entrega no manda recaudo, guarda en la caché y no registra la línea", async () => {
    await POST(request(false), { params: { storeId: "store-1" } });
    expect(mocks.quoteShipment.mock.calls[0][0]).not.toHaveProperty("codValue");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.log.mock.calls.some(([tag]) => tag === "[SHIPPING_QUOTE] contra entrega")).toBe(false);
  });
});
