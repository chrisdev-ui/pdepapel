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
 * Paso A1 del recibo: la API agrega `paymentResult` y `masked` para cualquier
 * quien pida el pedido, sin quitar nada todavía. La tienda (paso S1) los usa
 * antes de que se active el enmascarado (paso A2).
 */
let fixture: InventoryFixture | undefined;
const ids: Record<string, string> = {};

async function createOrder(key: string, status: OrderStatus, extra: Record<string, unknown> = {}) {
  const order = await testPrisma.order.create({
    data: {
      storeId: fixture!.store.id,
      orderNumber: `ORD-A1-${randomUUID().slice(0, 8)}`,
      status,
      type: OrderType.STANDARD,
      fullName: "Clienta Ejemplo",
      phone: "3000000000",
      email: "clienta@example.test",
      address: "Calle 1",
      city: "Medellín",
      department: "Antioquia",
      subtotal: 10000,
      total: 10000,
      payment: { create: { method: PaymentMethod.Bold, storeId: fixture!.store.id, transactionId: `TX-${key}` } },
      orderItems: { create: [{ productId: fixture!.component.id, quantity: 1, name: "Componente", price: 10000 }] },
      ...extra,
    } as never,
  });
  ids[key] = order.id;
}

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  await createOrder("guestPaid", OrderStatus.PAID);
  await createOrder("guestPending", OrderStatus.PENDING);
  await createOrder("panelCancelled", OrderStatus.CANCELLED, { createdBy: fixture.store.userId });
  await createOrder("account", OrderStatus.PAID, { userId: "user_cuenta_a1" });
});

afterAll(async () => {
  if (fixture) await deleteInventoryFixture(fixture);
  await testPrisma.$disconnect();
});

const as = (who: "owner" | "viewer" | "anonymous" | "account" | "otherAccount") => {
  session.userId = { owner: fixture!.store.userId, viewer: "user_viewer_a1", anonymous: null, account: "user_cuenta_a1", otherAccount: "user_otra_a1" }[who];
  session.claims = who === "viewer" ? { metadata: { role: "viewer", allowedStoreIds: [fixture!.store.id] } } : {};
};
const fetchOrder = async (key: string) => GET(new Request("http://admin.test/x"), { params: { storeId: fixture!.store.id, orderId: ids[key] } });

describe("GET /orders/[orderId]: paymentResult y masked para todos (A1)", () => {
  it("enlace sin sesión (invitada y panel): campos nuevos", async () => {
    as("anonymous");
    // Desde A2 el enlace sin sesión dueña recibe el recibo recortado (order-receipt-link-holder.test.ts).
    const paid = await (await fetchOrder("guestPaid")).json();
    expect(paid).toMatchObject({ paymentResult: "approved", masked: true, fullName: "Clienta E.", city: "Medellín" });
    expect((await (await fetchOrder("guestPending")).json()).paymentResult).toBe("pending");
    expect(await (await fetchOrder("panelCancelled")).json()).toMatchObject({ paymentResult: "declined", masked: true, createdByAdmin: true });
  });

  it("clienta con sesión dueña: campos nuevos y su pedido completo", async () => {
    as("account");
    expect(await (await fetchOrder("account")).json()).toMatchObject({ paymentResult: "approved", masked: false, email: "clienta@example.test" });
  });

  it("otra cuenta: sigue en 404", async () => {
    as("otherAccount");
    expect((await fetchOrder("account")).status).toBe(404);
  });

  it("dueña del panel: campos nuevos sobre la respuesta completa de siempre", async () => {
    as("owner");
    expect(await (await fetchOrder("guestPaid")).json()).toMatchObject({ paymentResult: "approved", masked: false, fullName: "Clienta Ejemplo", payment: { transactionId: "TX-guestPaid" } });
  });

  it("solo lectura: campos nuevos y la política que ya estaba (sin datos de la clienta)", async () => {
    as("viewer");
    const body = await (await fetchOrder("panelCancelled")).json();
    expect(body).toMatchObject({ paymentResult: "declined", masked: false });
    assertNoForbiddenKeys(body, "viewer");
  });
});
