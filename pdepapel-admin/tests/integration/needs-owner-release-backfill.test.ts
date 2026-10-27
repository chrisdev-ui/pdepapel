import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyNeedsOwnerRelease, planNeedsOwnerRelease, undoStatements } from "../../scripts/lib/needs-owner-release-backfill.mjs";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El arreglo de una vez para las conversaciones paradas en «es de Paula»:
 * misma regla en el ensayo y al aplicar, conteo comprobado, deshacer y una
 * segunda corrida que no encuentra nada.
 */
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

let fixture: InventoryFixture;

async function chat(data: Record<string, unknown>, lastOutBy: "OWNER" | "BOT" | null) {
  const phone = `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const row = await testPrisma.conversation.create({ data: { storeId: fixture.store.id, phone, ...data } });
  if (lastOutBy) {
    await testPrisma.conversationMessage.create({ data: { conversationId: row.id, direction: "OUTBOUND", sentBy: lastOutBy, body: "x", createdAt: ago(DAY), status: "SENT" } });
  }
  return row.id;
}

beforeAll(async () => {
  fixture = await createInventoryFixture();
});

afterAll(async () => {
  const conversations = await testPrisma.conversation.findMany({ where: { storeId: fixture.store.id }, select: { id: true } });
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations.map((row) => row.id) } } });
  await testPrisma.conversation.deleteMany({ where: { storeId: fixture.store.id } });
  await deleteInventoryFixture(fixture);
});

describe("backfill de NEEDS_OWNER viejos (MySQL)", () => {
  it("toma solo los que cumplen la regla, aplica con conteo, se deshace y no repite", async () => {
    const stale = await chat({ status: "NEEDS_OWNER", needsOwnerReason: null, lastOwnerAt: ago(20 * DAY) }, "OWNER");
    const recent = await chat({ status: "NEEDS_OWNER", needsOwnerReason: null, lastOwnerAt: ago(2 * DAY) }, "OWNER");
    const botLast = await chat({ status: "NEEDS_OWNER", needsOwnerReason: null, lastOwnerAt: ago(20 * DAY) }, "BOT");
    const pause = await chat({ status: "NEEDS_OWNER", needsOwnerReason: "owner_window", lastOwnerAt: ago(20 * DAY) }, "OWNER");
    const open = await chat({ status: "OPEN", needsOwnerReason: null, lastOwnerAt: ago(20 * DAY) }, "OWNER");
    const order = await testPrisma.order.create({ data: { storeId: fixture.store.id, orderNumber: `ORD-TEST-NO-${Date.now()}`, fullName: "x", phone: "+573001112233", address: "x", subtotal: 1, total: 1 } });
    const withOrder = await chat({ status: "NEEDS_OWNER", needsOwnerReason: null, lastOwnerAt: ago(20 * DAY), orderId: order.id }, "OWNER");

    const plan = await planNeedsOwnerRelease(testPrisma, { storeId: fixture.store.id });
    expect(plan.rows.map((row: { id: string }) => row.id)).toEqual([stale]);

    expect(await applyNeedsOwnerRelease(testPrisma, plan)).toBe(1);
    const after = await testPrisma.conversation.findMany({ where: { id: { in: [stale, recent, botLast, pause, open, withOrder] } }, select: { id: true, status: true, needsOwnerReason: true } });
    expect(after.find((row) => row.id === stale)).toMatchObject({ status: "NEEDS_OWNER", needsOwnerReason: "owner_window" });
    expect(after.filter((row) => row.id !== stale && row.id !== pause).every((row) => row.needsOwnerReason === null)).toBe(true);

    expect((await planNeedsOwnerRelease(testPrisma, { storeId: fixture.store.id })).rows).toHaveLength(0);

    for (const statement of undoStatements(plan.rows)) await testPrisma.$executeRawUnsafe(statement);
    await expect(testPrisma.conversation.findUniqueOrThrow({ where: { id: stale }, select: { needsOwnerReason: true } })).resolves.toEqual({ needsOwnerReason: null });
    await expect(testPrisma.conversation.findUniqueOrThrow({ where: { id: pause }, select: { needsOwnerReason: true } })).resolves.toEqual({ needsOwnerReason: "owner_window" });
    expect((await planNeedsOwnerRelease(testPrisma, { storeId: fixture.store.id })).rows).toHaveLength(1);

    await testPrisma.conversation.update({ where: { id: withOrder }, data: { orderId: null } });
    await testPrisma.order.delete({ where: { id: order.id } });
  });

  it("si una fila cambió entre el ensayo y aplicar, revierte todo", async () => {
    const a = await chat({ status: "NEEDS_OWNER", needsOwnerReason: null, lastOwnerAt: ago(40 * DAY) }, "OWNER");
    const plan = await planNeedsOwnerRelease(testPrisma, { storeId: fixture.store.id });
    expect(plan.rows.length).toBeGreaterThanOrEqual(1);
    await testPrisma.conversation.update({ where: { id: a }, data: { status: "OPEN" } });
    await expect(applyNeedsOwnerRelease(testPrisma, plan)).rejects.toThrow(/se revierte/);
    const untouched = await testPrisma.conversation.findMany({ where: { id: { in: plan.rows.map((row: { id: string }) => row.id) } }, select: { needsOwnerReason: true } });
    expect(untouched.every((row) => row.needsOwnerReason === null)).toBe(true);
  });
});
