import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * En un regalo la guía sale a nombre y teléfono de quien recibe; el correo
 * sigue siendo el de quien compra. En un pedido normal nada cambia.
 */
const mocks = vi.hoisted(() => ({
  createShipment: vi.fn(),
  findQuote: vi.fn(),
  shippingUpdate: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    shippingQuote: { findFirst: mocks.findQuote },
    shipping: { update: mocks.shippingUpdate },
    box: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/envioclick", () => ({
  envioClickClient: { createShipment: mocks.createShipment },
}));

import { createGuideForOrder } from "@/lib/shipping-helpers";

const order = {
  id: "order-1",
  orderNumber: "ORD-1",
  storeId: "store-1",
  fullName: "Luisa Sánchez",
  phone: "+573009999999",
  email: "luisa@example.com",
  address: "Calle 1 # 2-3",
  daneCode: "05001000",
  total: 85900,
  orderItems: [],
  shipping: {
    id: "ship-1",
    envioClickIdOrder: null,
    envioClickIdRate: 10,
    isCOD: false,
  },
};

describe("createGuideForOrder · destinatario del paquete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findQuote.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      weight: 1,
      height: 10,
      width: 10,
      length: 10,
      declaredValue: 85900,
    });
    mocks.createShipment.mockResolvedValue({
      data: {
        idOrder: 77,
        tracker: "GUIA77",
        url: "https://example.com/guia",
        guide: "",
        requestPickup: true,
        external_order_id: "x",
        origin: {},
        destination: {},
      },
    });
    mocks.shippingUpdate.mockResolvedValue({});
  });

  it("ships a normal order to the buyer", async () => {
    await createGuideForOrder("order-1", "store-1", order);

    const destination = mocks.createShipment.mock.calls[0][0].destination;
    expect(destination).toMatchObject({
      firstName: "Luisa",
      lastName: "Sánchez",
      phone: "3009999999",
      email: "luisa@example.com",
    });
  });

  it("ships a gift to the recipient, with her phone, keeping the buyer's email", async () => {
    await createGuideForOrder("order-1", "store-1", {
      ...order,
      isGift: true,
      giftRecipientName: "Mariana López",
      giftRecipientPhone: "+573001234567",
      giftRecipientEmail: "mariana@example.com",
    });

    const destination = mocks.createShipment.mock.calls[0][0].destination;
    expect(destination).toMatchObject({
      firstName: "Mariana",
      lastName: "López",
      phone: "3001234567",
      email: "luisa@example.com",
    });
  });

  it("falls back to the buyer's phone when the recipient left none", async () => {
    await createGuideForOrder("order-1", "store-1", {
      ...order,
      isGift: true,
      giftRecipientName: "Mariana López",
      giftRecipientPhone: null,
    });

    const destination = mocks.createShipment.mock.calls[0][0].destination;
    expect(destination).toMatchObject({
      firstName: "Mariana",
      phone: "3009999999",
    });
  });
});
