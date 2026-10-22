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

import { GET } from "@/app/api/[storeId]/orders/[orderId]/route";

/**
 * La cuenta de solo lectura no tenía rama propia en GET /orders/[orderId]:
 * caía en la de la clienta y, con un pedido de invitada, recibía nombre,
 * teléfono, correo, dirección y la transacción.
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
      orderNumber: `ORD-V-${randomUUID().slice(0, 8)}`,
      status: OrderStatus.PAID,
      type: OrderType.STANDARD,
      fullName: "Clienta Invitada",
      phone: "3000000000",
      email: "invitada@example.test",
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      documentId: "123",
      subtotal: 10000,
      total: 10000,
      paidAt: new Date(),
      riskScore: 10,
      legalTermsVersion: "2026-10-21",
      legalPrivacyVersion: "2026-10-21",
      legalConsentAt: new Date("2026-10-22T15:00:00Z"),
      legalConsentChannel: "CHECKOUT",
      payment: { create: { method: PaymentMethod.Bold, storeId: store, transactionId: "TX-1" } },
      orderItems: { create: [{ productId: fixture.component.id, quantity: 1, name: "Componente", price: 10000 }] },
    } as never,
  });
  orderId = order.id;
  await testPrisma.shipping.create({ data: { orderId, storeId: store, trackingCode: "GUIA-1", trackingUrl: "https://track.test/1", guideUrl: "https://guide.test/1" } as never });
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

const signIn = (role: "owner" | "viewer" | "anonymous") => {
  session.userId = role === "owner" ? fixture!.store.userId : role === "viewer" ? "user_viewer_orders" : null;
  session.claims = role === "viewer" ? { metadata: { role: "viewer", allowedStoreIds: [fixture!.store.id] } } : {};
};
const fetchOrder = async () => GET(new Request("http://admin.test/api/x"), { params: { storeId: fixture!.store.id, orderId } });

describe("GET /orders/[orderId] para la cuenta de solo lectura", () => {
  it("ve el pedido (estado, líneas, total, ciudad) sin contacto, transacción, guía ni riesgo", async () => {
    signIn("viewer");
    const response = await fetchOrder();
    expect(response.status).toBe(200);
    const body = await response.json();
    assertNoForbiddenKeys(body, "viewer");
    expect(body).toMatchObject({ id: orderId, status: "PAID", city: "Medellín", total: 10000 });
    expect(body.orderItems).toHaveLength(1);
    expect(body.payment).toMatchObject({ method: "Bold" });
  });

  it("la dueña sigue viendo el pedido completo", async () => {
    signIn("owner");
    const body = await (await fetchOrder()).json();
    expect(body).toMatchObject({ fullName: "Clienta Invitada", phone: "3000000000" });
    expect(body.payment.transactionId).toBe("TX-1");
  });
});
