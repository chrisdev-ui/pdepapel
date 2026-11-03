import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { captureLogs, fixtureCustomer, personalValues } from "@/tests/helpers/log-capture";

const mocks = vi.hoisted(() => ({
  createShipment: vi.fn(),
  findQuote: vi.fn(),
  shippingUpdate: vi.fn(),
  alertIfInsufficientCredit: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    shippingQuote: { findFirst: mocks.findQuote },
    shipping: { update: mocks.shippingUpdate },
    box: { findMany: vi.fn().mockResolvedValue([]) },
    capsuleOrder: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/envioclick", () => ({ envioClickClient: { createShipment: mocks.createShipment } }));
vi.mock("@/lib/envioclick-credit-alert", () => ({ alertIfInsufficientCredit: mocks.alertIfInsufficientCredit }));

import { createGuideForOrder } from "@/lib/shipping-helpers";

/** El registro previo a cada guía escribía origen y destinatario completos, también en las que salían bien. */
const c = fixtureCustomer();
const order = {
  id: "order-1",
  orderNumber: "ORD-1",
  storeId: "store-1",
  fullName: `${c.firstName} ${c.lastName}`,
  phone: c.phoneIntl,
  email: c.email,
  address: c.address,
  documentId: c.document,
  daneCode: "11001000",
  total: 85900,
  orderItems: [],
  shipping: { id: "ship-1", envioClickIdOrder: null, envioClickIdRate: 10, isCOD: false },
};

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  vi.clearAllMocks();
  logs = captureLogs();
  mocks.findQuote.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), weight: 1, height: 10, width: 10, length: 10, declaredValue: 85900 });
  mocks.shippingUpdate.mockResolvedValue({});
});
afterEach(() => logs.restore());

const expectNoPersonalData = (text: string) => {
  for (const value of personalValues(c)) expect(text).not.toContain(value);
};

describe("createGuideForOrder: registros sin datos de la clienta", () => {
  it("guía creada: el registro lleva pedido, tarifa y municipios, no el destinatario", async () => {
    mocks.createShipment.mockResolvedValue({
      data: { idOrder: 77, tracker: "GUIA77", url: "u", guide: "", requestPickup: true, external_order_id: "x", origin: {}, destination: {} },
    });
    await createGuideForOrder("order-1", "store-1", order);
    // La guía sigue saliendo a nombre de la clienta: solo el registro deja de llevarlo.
    expect(mocks.createShipment.mock.calls[0][0].destination.email).toBe(c.email);
    expect(logs.text()).toContain("ORD-1");
    expect(logs.text()).toContain("11001000");
    expectNoPersonalData(logs.text());
  });

  it("sin saldo: avisa a la dueña con la referencia del pedido y el error que sube no trae datos", async () => {
    const failure = Object.assign(new Error(`EnvioClick API Error: NOT OK. Details: No tiene suficiente crédito ${c.email}`), {
      reason: "insufficient_credit",
    });
    mocks.createShipment.mockRejectedValue(failure);
    const thrown = await createGuideForOrder("order-1", "store-1", order).catch((error: unknown) => error);
    expect(mocks.alertIfInsufficientCredit).toHaveBeenCalledWith(failure, { storeId: "store-1", orderId: "order-1", orderNumber: "ORD-1" });
    expect(thrown).toBe(failure);
    expectNoPersonalData(logs.text());
  });

  it("una cotización vencida responde con el motivo limpio", async () => {
    mocks.createShipment.mockRejectedValue(new Error(`idRate inválido para ${c.address} ${c.phone}`));
    const thrown = (await createGuideForOrder("order-1", "store-1", order).catch((error: unknown) => error)) as Error;
    expect(thrown.message).toContain("La cotización de envío ha expirado");
    expectNoPersonalData(thrown.message);
    expect(mocks.alertIfInsufficientCredit).toHaveBeenCalledTimes(1);
  });
});
