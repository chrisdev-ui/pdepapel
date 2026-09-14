import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  requote: vi.fn(),
  quoteFindMany: vi.fn(),
  orderFindFirst: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/cors", () => ({ createCorsHeaders: () => ({}) }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (_req: unknown, _store: string, handler: () => unknown) =>
    handler(),
}));
vi.mock("@/lib/shipping-helpers", () => ({
  requoteCartShipping: mocks.requote,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    shippingQuote: { findMany: mocks.quoteFindMany },
    order: { findFirst: mocks.orderFindFirst },
    product: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { POST } from "@/app/api/[storeId]/checkout/route";

const call = (body: Record<string, unknown>) =>
  POST(
    new Request("https://admin.test/api/store-1/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { storeId: "store-1" } },
  );

const base = {
  fullName: "Clienta",
  phone: "3001234567",
  email: "clienta@example.com",
  documentId: "1234567890",
  address: "Calle 10 #40-20",
  city: "MEDELLÍN",
  department: "ANTIOQUIA",
  daneCode: "05001000",
  orderItems: [{ productId: "p1", quantity: 1 }],
  subtotal: 15000,
  total: 15000,
  payment: { method: "BankTransfer" },
};

describe("el costo de envío no lo pone quien compra", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.currentUser.mockResolvedValue(null);
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.quoteFindMany.mockResolvedValue([]);
    mocks.requote.mockReset();
  });

  it("una tarifa que no está en caché se re-cotiza, no se acepta tal cual", async () => {
    mocks.requote.mockResolvedValue([]);

    const response = await call({
      ...base,
      guestId: "g1",
      envioClickIdRate: 99999,
      shipping: {
        cost: 0,
        provider: "ENVIOCLICK",
        carrierName: "Envia",
        idRate: 99999,
      },
    });

    expect(mocks.requote).toHaveBeenCalledOnce();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("tarifa de envío ya no está disponible"),
    });
  });

  it("si la transportadora no responde, el pedido no entra con el número del cliente", async () => {
    mocks.requote.mockRejectedValue(new Error("ECONNREFUSED"));

    const response = await call({
      ...base,
      guestId: "g2",
      envioClickIdRate: 99999,
      shipping: {
        cost: 0,
        provider: "ENVIOCLICK",
        carrierName: "Envia",
        idRate: 99999,
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("No pudimos confirmar el costo de envío"),
    });
  });

  it("la entrega local no pasa por la transportadora", async () => {
    // CUSTOM es el trato a mano (Medellín, WhatsApp): sigue como estaba.
    const response = await call({
      ...base,
      guestId: "g3",
      envioClickIdRate: 0,
      shipping: {
        cost: 0,
        provider: "CUSTOM",
        carrierName: "Domicilio Medellín",
      },
    });

    expect(mocks.requote).not.toHaveBeenCalled();
    // No llega a crear el pedido con estos mocks, pero nunca por el envío.
    if (response.status >= 400) {
      const body = await response.json();
      expect(String(body.error)).not.toMatch(/envío|cotización/i);
    }
  });
});
