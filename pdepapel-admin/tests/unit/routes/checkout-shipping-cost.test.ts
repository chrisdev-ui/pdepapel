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
    // 409 y no 400: no es que la petición esté mal escrita, es que la tarifa
    // que eligió ya no existe. El cuerpo trae con qué seguir comprando.
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Elige otra opción de envío"),
      details: { code: "SHIPPING_RATE_UNAVAILABLE", alternatives: [] },
    });
  });

  it("con un número inventado NO se cobra lo que diga el cliente", async () => {
    // Lo que de verdad protege esta prueba: la transportadora sí responde,
    // pero con otra tarifa. Jamás se acepta el `cost: 0` que mandó el cliente.
    mocks.requote.mockResolvedValue([
      {
        idRate: 26341730,
        idCarrier: 1,
        idProduct: 2,
        carrier: "Envia",
        product: "Normal",
        flete: 13997,
        minimumInsurance: 0,
        totalCost: 13997,
        deliveryDays: 2,
        isCOD: false,
      },
    ]);

    const response = await call({
      ...base,
      guestId: "g1",
      envioClickIdRate: 99999,
      shipping: { cost: 0, provider: "ENVIOCLICK", carrierName: "Envia", idRate: 99999 },
    });

    // Mismo servicio pero de 0 a 13.997: eso lo confirma ella, no nosotros.
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      details: { code: "SHIPPING_RATE_CHANGED", previousCost: 0 },
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

  it("REGRESIÓN DEL INCIDENTE: caché vencida y el pedido SIGUE adelante", async () => {
    // 2026-09-15, destino 05045000. La caché dura 2 h; al vencer se re-cotiza
    // y se buscaba la tarifa por `idRate`. Ese número cambia cuando cambian
    // las medidas del paquete (medido: 1,0 kg → 26341730, 1,5 kg → 26341752),
    // y la re-cotización recalcula las medidas desde el carrito. Resultado:
    // ningún id coincidía y la compra moría con un 400 sin salida.
    //
    // Ahora manda el servicio: misma transportadora, mismo producto, mismo
    // precio ⇒ se sigue. Aquí se comprueba que el envío YA NO es el que frena
    // la compra (después falla por otra cosa, porque este banco de pruebas no
    // tiene productos: eso es justo lo que demuestra que pasó del envío).
    mocks.quoteFindMany.mockResolvedValue([]); // caché vencida ⇒ sin filas
    mocks.requote.mockResolvedValue([
      {
        idRate: 26341752, // ← distinto del que eligió la clienta
        idCarrier: 1,
        idProduct: 2,
        carrier: "Envia",
        product: "Normal",
        flete: 13997,
        minimumInsurance: 0,
        totalCost: 13997,
        deliveryDays: 2,
        isCOD: false,
      },
    ]);

    const response = await call({
      ...base,
      guestId: "g1",
      envioClickIdRate: 26341730, // el de la cotización vencida
      shipping: {
        cost: 13997,
        provider: "ENVIOCLICK",
        carrierName: "Envia",
        productName: "Normal",
        idRate: 26341730,
      },
    });

    expect(mocks.requote).toHaveBeenCalledOnce();
    const cuerpo = await response.json();
    // Lo que importa: ya no es el callejón sin salida de antes.
    expect(cuerpo.error ?? "").not.toContain("tarifa de envío ya no está disponible");
    expect(cuerpo.details?.code).not.toBe("SHIPPING_RATE_CHANGED");
    expect(cuerpo.details?.code).not.toBe("SHIPPING_RATE_UNAVAILABLE");
  });
});
