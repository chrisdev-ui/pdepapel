import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

import { applyOrderSourceBackfill, planOrderSourceBackfill } from "../../scripts/lib/order-source-backfill.mjs";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const customer = { fullName: "Luisa Sánchez", phone: "+573009999999", email: "luisa@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000" };

describe("backfill de Order.source (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  const conversationIds: string[] = [];

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    await testPrisma.conversation.deleteMany({ where: { id: { in: conversationIds.splice(0) } } });
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("clasifica solo lo seguro, deja el resto en null y una segunda corrida no escribe nada", async () => {
    fixture = await createInventoryFixture();
    const storeId = fixture.store.id;
    const owner = fixture.store.userId;
    const order = async (label: string, data: Record<string, unknown>, method?: PaymentMethod) => {
      const created = await testPrisma.order.create({
        data: { storeId, orderNumber: `ORD-SRC-${randomUUID().slice(0, 8)}`, status: OrderStatus.PAID, type: OrderType.STANDARD, subtotal: 10000, total: 10000, ...customer, ...data },
      });
      if (method) await testPrisma.paymentDetails.create({ data: { storeId, orderId: created.id, method } });
      return [label, created.id] as const;
    };

    const ids = Object.fromEntries(
      await Promise.all([
        order("pos", { type: OrderType.POINT_OF_SALE, createdBy: owner }, PaymentMethod.Bold),
        order("feria", { type: OrderType.FESTIVAL, createdBy: owner }, PaymentMethod.CASH),
        order("personalizadoDueña", { type: OrderType.CUSTOM, createdBy: owner }),
        order("personalizadoInvitado", { type: OrderType.CUSTOM, guestId: `guest-${randomUUID()}` }),
        order("boldInvitado", { guestId: `guest-${randomUUID()}` }, PaymentMethod.Bold),
        order("wompiCliente", { userId: `user_${randomUUID()}` }, PaymentMethod.Wompi),
        order("boldDueña", { userId: owner }, PaymentMethod.Bold),
        order("boldSinCliente", {}, PaymentMethod.PayU),
        order("ga4Transferencia", { guestId: `guest-${randomUUID()}`, analyticsPurchaseTrackedAt: new Date() }, PaymentMethod.BankTransfer),
        order("transferencia", { guestId: `guest-${randomUUID()}` }, PaymentMethod.BankTransfer),
        order("boldWhatsApp", { guestId: `guest-${randomUUID()}` }, PaymentMethod.Bold),
        order("yaConOrigen", { source: OrderSource.WHATSAPP, guestId: `guest-${randomUUID()}` }, PaymentMethod.Bold),
      ]),
    );
    const conversation = await testPrisma.conversation.create({ data: { storeId, orderId: ids.boldWhatsApp } });
    conversationIds.push(conversation.id);

    const plan = await planOrderSourceBackfill(testPrisma, storeId);
    expect(plan.withoutSource).toBe(11);
    expect(Object.fromEntries(Object.entries(plan.groups).map(([group, list]) => [group, (list as string[]).length]))).toEqual({
      pos: 1,
      feria: 1,
      panel: 1,
      pago_en_linea: 2,
      ga4: 1,
    });
    expect(plan.unknown).toBe(5);

    await expect(applyOrderSourceBackfill(testPrisma, plan)).resolves.toEqual({ pos: 1, feria: 1, panel: 1, pago_en_linea: 2, ga4: 1 });

    const rows = await testPrisma.order.findMany({ where: { storeId }, select: { id: true, source: true } });
    const sourceOf = Object.fromEntries(rows.map((row) => [row.id, row.source]));
    expect(Object.fromEntries(Object.entries(ids).map(([label, id]) => [label, sourceOf[id]]))).toEqual({
      pos: OrderSource.POS,
      feria: OrderSource.FAIR,
      personalizadoDueña: OrderSource.PANEL,
      personalizadoInvitado: null,
      boldInvitado: OrderSource.STORE,
      wompiCliente: OrderSource.STORE,
      boldDueña: null,
      boldSinCliente: null,
      ga4Transferencia: OrderSource.STORE,
      transferencia: null,
      boldWhatsApp: null,
      yaConOrigen: OrderSource.WHATSAPP,
    });

    const again = await planOrderSourceBackfill(testPrisma, storeId);
    expect(Object.values(again.groups).flat()).toEqual([]);
    await expect(applyOrderSourceBackfill(testPrisma, plan)).resolves.toEqual({ pos: 0, feria: 0, panel: 0, pago_en_linea: 0, ga4: 0 });
  });
});
