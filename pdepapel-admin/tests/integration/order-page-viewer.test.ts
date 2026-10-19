import { randomUUID } from "node:crypto";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));

import { getOrder } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/server/get-order";

/**
 * La ficha del pedido (`getOrder` → `initialData`) le llegaba a la cuenta de
 * solo lectura con `scrubOrder` superficial: el envío traía guía, rastreo y
 * el JSON con los datos de quien recibe; el pago, la transacción; el pedido,
 * el enlace público, el riesgo y el costo de envío de la casa.
 */
let fixture: InventoryFixture | undefined;
let orderId = "";

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  const store = fixture.store.id;
  const order = await testPrisma.order.create({
    data: {
      storeId: store,
      orderNumber: `ORD-P-${randomUUID().slice(0, 8)}`,
      status: OrderStatus.PAID,
      type: OrderType.STANDARD,
      fullName: "Clienta Invitada",
      phone: "3000000000",
      email: "invitada@example.test",
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      subtotal: 10000,
      total: 22000,
      shippingCost: 9000,
      token: `tok-${randomUUID()}`,
      riskScore: 40,
      riskReasons: "velocity",
      isGift: true,
      giftRecipientName: "Quien recibe",
      giftMessage: "Feliz día",
      paidAt: new Date(),
      payment: { create: { method: PaymentMethod.Bold, storeId: store, transactionId: "TX-2", details: JSON.stringify({ last4: "1111" }) } },
      orderItems: { create: [{ productId: fixture.component.id, quantity: 1, name: "Componente", price: 10000 }] },
    } as never,
  });
  orderId = order.id;
  await testPrisma.shipping.create({
    data: {
      orderId,
      storeId: store,
      cost: 12000,
      flete: 9000,
      trackingCode: "GUIA-2",
      trackingUrl: "https://track.test/2",
      guideUrl: "https://guide.test/2",
      destinationData: { name: "Quien recibe", phone: "3000000000", address: "Cra 4" },
      originData: { name: "Tienda" },
      notes: "Dejar en portería",
    } as never,
  });
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.shipping.deleteMany({ where: { orderId } });
    await testPrisma.paymentDetails.deleteMany({ where: { orderId } });
    await testPrisma.orderItem.deleteMany({ where: { orderId } });
    await testPrisma.order.deleteMany({ where: { id: orderId } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

const signIn = (role: "owner" | "viewer") => {
  session.userId = role === "owner" ? fixture!.store.userId : "user_viewer_order_page";
  session.claims = role === "viewer" ? { metadata: { role: "viewer", allowedStoreIds: [fixture!.store.id] } } : {};
};

describe("getOrder (ficha del pedido) para la cuenta de solo lectura", () => {
  it("no trae contacto, transacción, guía, rastreo, enlace público, riesgo ni costos de la casa", async () => {
    signIn("viewer");
    const { order } = await getOrder(orderId, fixture!.store.id);
    assertNoForbiddenKeys(order, "viewer");
    const json = JSON.parse(JSON.stringify(order));
    expect(json.shipping).not.toHaveProperty("flete");
    expect(json.shipping).not.toHaveProperty("notes");
    expect(json).not.toHaveProperty("giftMessage");
    expect(json.payment).not.toHaveProperty("details");
  });

  it("los totales siguen saliendo: el cobro de envío a la clienta se queda", async () => {
    signIn("viewer");
    const { order } = await getOrder(orderId, fixture!.store.id);
    expect(order).toMatchObject({ total: 22000, city: "Medellín", shipping: { cost: 12000 } });
  });

  it("la dueña ve todo", async () => {
    signIn("owner");
    const { order } = await getOrder(orderId, fixture!.store.id);
    expect(order).toMatchObject({ fullName: "Clienta Invitada", token: expect.any(String), shipping: { trackingCode: "GUIA-2", flete: 9000 } });
  });
});
