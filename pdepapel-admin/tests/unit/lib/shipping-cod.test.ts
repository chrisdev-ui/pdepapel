import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contra entrega con EnvioClick (2026-10-15): una recotización de un pedido
 * contra entrega pide recaudo, cada tarifa trae lo que cobra EnvioClick por
 * recaudar, y la guía rechazada por «idRate no válido para COD» le dice a
 * Paula qué hacer en vez de «la cotización expiró».
 */
const mocks = vi.hoisted(() => ({ quoteShipment: vi.fn(), createShipment: vi.fn(), findQuote: vi.fn(), shippingUpdate: vi.fn() }));

vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: vi.fn().mockResolvedValue([]) },
    box: { findMany: vi.fn().mockResolvedValue([]) },
    capsuleOrder: { findMany: vi.fn().mockResolvedValue([]) },
    shippingQuote: { findFirst: mocks.findQuote },
    shipping: { update: mocks.shippingUpdate },
  },
}));
vi.mock("@/lib/envioclick", () => ({ envioClickClient: { quoteShipment: mocks.quoteShipment, createShipment: mocks.createShipment } }));

import { COD_RATE_MISMATCH_MESSAGE, createGuideForOrder, requoteCartShipping } from "@/lib/shipping-helpers";

const quotation = {
  data: {
    rates: [
      { idRate: 1, idCarrier: 2, idProduct: 3, carrier: "ENVIA", product: "Normal", flete: 17000, minimumInsurance: 1000, deliveryDays: 3, cod: true, codDetails: { codCost: 7000, codCostWithInsurance: 7500, codPaymentMethod: "cash", includeGuideCost: false } },
      { idRate: 2, idCarrier: 4, idProduct: 5, carrier: "COORDINADORA", product: "Normal", flete: 16000, minimumInsurance: 900, deliveryDays: 4, cod: false, codDetails: null },
    ],
  },
};

const input = { storeId: "store-1", items: [{ productId: "p-1", quantity: 1 }], destination: { daneCode: "17380000", address: "Centro" }, contentValue: 52000 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findQuote.mockResolvedValue(null);
  mocks.quoteShipment.mockResolvedValue(quotation);
});

describe("recotizar un carrito", () => {
  it("contra entrega pide recaudo por el valor del pedido y trae lo que cobra EnvioClick", async () => {
    const rates = await requoteCartShipping({ ...input, cod: { value: 52000 } });

    expect(mocks.quoteShipment).toHaveBeenCalledWith(expect.objectContaining({ codValue: 52000, codPaymentMethod: "cash", includeGuideCost: false }));
    expect(rates.map(({ carrier, isCOD, codCost }) => ({ carrier, isCOD, codCost }))).toEqual([
      { carrier: "ENVIA", isCOD: true, codCost: 7000 },
      { carrier: "COORDINADORA", isCOD: false, codCost: null },
    ]);
  });

  it("sin contra entrega no manda nada de recaudo", async () => {
    await requoteCartShipping(input);
    const body = mocks.quoteShipment.mock.calls[0][0];
    expect(body).not.toHaveProperty("codValue");
    expect(body).not.toHaveProperty("codPaymentMethod");
  });
});

describe("crear la guía contra entrega con una tarifa sin recaudo", () => {
  it("traduce el rechazo de EnvioClick a lo que tiene que hacer Paula", async () => {
    mocks.findQuote.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), weight: 1, height: 10, width: 10, length: 10, declaredValue: 52000 });
    mocks.createShipment.mockRejectedValue(new Error('EnvioClick API Error: NOT OK. Details: {"error":["Unprocessed Entity.","Este no es un idRate válido para COD."]}'));

    await expect(
      createGuideForOrder("order-1", "store-1", {
        id: "order-1",
        orderNumber: "ORD-1",
        storeId: "store-1",
        fullName: "Clienta Prueba",
        phone: "+573001234567",
        email: "clienta@prueba.test",
        address: "Calle 1 # 2-3",
        daneCode: "17380000",
        total: 52000,
        orderItems: [],
        shipping: { id: "ship-1", envioClickIdOrder: null, envioClickIdRate: 2, isCOD: true },
      } as never),
    ).rejects.toThrow(COD_RATE_MISMATCH_MESSAGE);
    expect(mocks.shippingUpdate).not.toHaveBeenCalled();
  });
});
