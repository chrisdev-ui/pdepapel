import { beforeEach, describe, expect, it, vi } from "vitest";

import { solveCodFee } from "@/lib/cod-fee";

/**
 * /shipment/quote con «Pago contra entrega»: cotiza dos veces con recaudo y
 * devuelve el recaudo FINAL de cada tarifa (el que cobra el pedido), no
 * guarda la respuesta en la caché y deja una línea de registro sin la
 * dirección. Sin contra entrega, una sola cotización, sin recaudo, a la caché.
 */
const mocks = vi.hoisted(() => ({ quoteShipment: vi.fn(), upsert: vi.fn(), threshold: { value: null as number | null }, log: vi.spyOn(console, "log") }));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: vi.fn().mockResolvedValue([]) },
    box: { findMany: vi.fn().mockResolvedValue([]) },
    capsuleEdition: { findMany: vi.fn().mockResolvedValue([]) },
    store: { findUnique: vi.fn(async () => ({ freeShippingThreshold: mocks.threshold.value })) },
    shippingQuote: { findUnique: vi.fn().mockResolvedValue(null), upsert: mocks.upsert, update: vi.fn(), deleteMany: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("@/lib/envioclick", () => ({ envioClickClient: { quoteShipment: mocks.quoteShipment } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true }), getClientKey: () => "test" }));

import { POST } from "@/app/api/[storeId]/shipment/quote/route";

const ADDRESS = "Calle 1 # 2-3";
/** ENVIA: 3 % del valor a recaudar + 3.000. Coordinadora: plano. */
const enviaFee = (codValue: number) => 0.03 * codValue + 3000;

const request = (isCOD: boolean, extra: Record<string, unknown> = {}) =>
  new Request("https://admin.test/api/store-1/shipment/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ destination: { daneCode: "17380000", address: ADDRESS }, orderTotal: 52000, items: [{ productId: "MAN-1", name: "Libreta", quantity: 1, price: 52000 }], forceRefresh: true, isCOD, ...extra }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.threshold.value = null;
  mocks.quoteShipment.mockImplementation(async (body: { codValue?: number }) => ({
    data: {
      packages: [],
      idCarriersNoWsResult: [],
      rates: [
        { idRate: 1 + (body.codValue ?? 0), idCarrier: 2, idProduct: 3, carrier: "ENVIA", product: "Normal", flete: 17000, minimumInsurance: 1000, deliveryDays: 3, cod: Boolean(body.codValue), codDetails: body.codValue ? { codCost: enviaFee(body.codValue), codCostWithInsurance: 0, codPaymentMethod: "cash", includeGuideCost: false } : null },
        { idRate: 2 + (body.codValue ?? 0), idCarrier: 4, idProduct: 5, carrier: "COORDINADORA", product: "Normal", flete: 24000, minimumInsurance: 1781, deliveryDays: 4, cod: Boolean(body.codValue), codDetails: body.codValue ? { codCost: 6116, codCostWithInsurance: 0, codPaymentMethod: "cash", includeGuideCost: false } : null },
      ],
    },
  }));
});

describe("POST /shipment/quote", () => {
  it("contra entrega: dos cotizaciones con recaudo y el recaudo final de cada tarifa, registrado sin la dirección", async () => {
    const response = await POST(request(true, { amountBeforeShipping: 50000, productSubtotal: 50000 }), { params: { storeId: "store-1" } });
    expect(response.status).toBe(200);

    expect(mocks.quoteShipment).toHaveBeenCalledTimes(2);
    expect(mocks.quoteShipment.mock.calls[0][0]).toMatchObject({ codValue: 50000, codPaymentMethod: "cash", includeGuideCost: false });
    const v2 = mocks.quoteShipment.mock.calls[1][0].codValue;
    const { quotes } = await response.json();
    const envia = quotes.find((quote: { carrier: string }) => quote.carrier === "ENVIA");
    expect(envia).toMatchObject({ isCOD: true, totalCost: 18000, idRate: 1 + v2 });
    expect(envia.codFee).toBe(solveCodFee(68000, { codValue: 50000, fee: enviaFee(50000) }, { codValue: v2, fee: enviaFee(v2) }));
    // El recaudo final cuadra: lo que cobra EnvioClick sobre el total con recaudo.
    expect(envia.codFee - enviaFee(68000 + envia.codFee)).toBeLessThan(1);
    expect(quotes.find((quote: { carrier: string }) => quote.carrier === "COORDINADORA").codFee).toBe(6116);
    expect(mocks.upsert).not.toHaveBeenCalled();

    const line = mocks.log.mock.calls.find(([tag]) => tag === "[SHIPPING_QUOTE] contra entrega");
    expect(JSON.parse(String(line![1]))).toMatchObject({ destDaneCode: "17380000", rates: [{ carrier: "ENVIA", cod: true, codFee: envia.codFee }, { carrier: "COORDINADORA", cod: true, codFee: 6116 }] });
    expect(String(line![1])).not.toContain(ADDRESS);
  });

  it("contra entrega con envío gratis: el recaudo se calcula sobre el pedido sin envío", async () => {
    mocks.threshold.value = 40000;
    const response = await POST(request(true, { amountBeforeShipping: 50000, productSubtotal: 50000 }), { params: { storeId: "store-1" } });
    const { quotes } = await response.json();
    const envia = quotes.find((quote: { carrier: string }) => quote.carrier === "ENVIA");
    // 0,03·(50.000 + F) + 3.000 = F → F = 4.500 / 0,97 = 4.639,18 → 4.640
    expect(envia.codFee).toBe(4640);
  });

  it("sin contra entrega: una sola cotización, sin recaudo, a la caché y sin la línea", async () => {
    await POST(request(false), { params: { storeId: "store-1" } });
    expect(mocks.quoteShipment).toHaveBeenCalledTimes(1);
    expect(mocks.quoteShipment.mock.calls[0][0]).not.toHaveProperty("codValue");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.log.mock.calls.some(([tag]) => tag === "[SHIPPING_QUOTE] contra entrega")).toBe(false);
  });
});

describe("POST /shipment/quote con un cuerpo ilegible", () => {
  const raw = (body: string) =>
    new Request("https://admin.test/api/store-1/shipment/quote", { method: "POST", headers: { "content-type": "application/json" }, body });

  it.each([["JSON cortado", "{\"destination\":"], ["vacío", ""], ["null", "null"], ["una lista", "[]"]])("%s responde 400 en español, no 500", async (_label, body) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await POST(raw(body), { params: { storeId: "store-1" } });
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toMatch(/cuerpo de la solicitud no es JSON válido|necesita un objeto/);
    expect(mocks.quoteShipment).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
