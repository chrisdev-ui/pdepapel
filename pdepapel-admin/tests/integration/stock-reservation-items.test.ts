import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { StockReservationStatus } from "@prisma/client";

import { createReservation, releaseReservation } from "@/lib/stock-reservations";
import { flagUnbackedReservations } from "@/lib/stock-review";

import {
  applyReservationItemsBackfill,
  planReservationItemsBackfill,
  verifyReservationItems,
} from "../../scripts/lib/reservation-items-backfill.mjs";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Reservas v2, fase 1 (expansión): cada reserva nueva escribe también su ítem,
 * «sin respaldo» llega al ítem, y el backfill da un ítem igual al encabezado a
 * las reservas anteriores sin repetir nada si se corre otra vez.
 */
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/stock-review-alerts", () => ({ notifyStockShortfall: vi.fn(), notifyUnbackedReservations: vi.fn() }));

const DAY = 86_400_000;

describe("ítems de reserva (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  const setup = async (stock: number) => {
    fixture = await createInventoryFixture();
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { stock } });
    return fixture;
  };
  const reserve = (f: InventoryFixture, quantity: number, productId = f.component.id) =>
    createReservation({ storeId: f.store.id, productId, quantity, customerName: "Clienta del grupo", createdBy: f.store.userId });
  const headerOnly = (f: InventoryFixture, data: { quantity: number; status?: StockReservationStatus; unbackedAt?: Date }) =>
    testPrisma.stockReservation.create({
      data: {
        storeId: f.store.id,
        productId: f.component.id,
        customerName: "Reserva anterior",
        expiresAt: new Date(Date.now() + 3 * DAY),
        createdBy: f.store.userId,
        ...data,
      },
    });

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("crear una reserva escribe un ítem igual al encabezado, también para un kit", async () => {
    const f = await setup(10);
    const { reservation } = await reserve(f, 3);
    const { reservation: kitHold } = await reserve(f, 1, f.kit.id);

    const items = await testPrisma.stockReservationItem.findMany({ where: { storeId: f.store.id }, orderBy: { createdAt: "asc" } });
    expect(items).toEqual([
      expect.objectContaining({ reservationId: reservation.id, productId: f.component.id, quantity: 3, unbackedAt: null, addedBy: f.store.userId }),
      expect.objectContaining({ reservationId: kitHold.id, productId: f.kit.id, quantity: 1 }),
    ]);
    await expect(verifyReservationItems(testPrisma, { storeId: f.store.id })).resolves.toMatchObject({ reservations: 2, items: 2, withoutItems: 0, mismatched: 0 });

    await releaseReservation(f.store.id, reservation.id, f.store.userId);
    await expect(testPrisma.stockReservationItem.count({ where: { reservationId: reservation.id } })).resolves.toBe(1);
  });

  it("«sin respaldo» se marca en el encabezado y en su ítem", async () => {
    const f = await setup(1);
    const { reservation } = await reserve(f, 1);
    await testPrisma.product.update({ where: { id: f.component.id }, data: { stock: 0 } });

    const flagged = await testPrisma.$transaction((tx) => flagUnbackedReservations(tx, [f.component.id]));

    expect(flagged).toEqual([reservation.id]);
    const header = await testPrisma.stockReservation.findUniqueOrThrow({ where: { id: reservation.id }, select: { unbackedAt: true } });
    const item = await testPrisma.stockReservationItem.findFirstOrThrow({ where: { reservationId: reservation.id }, select: { unbackedAt: true } });
    expect(header.unbackedAt).toBeInstanceOf(Date);
    expect(item.unbackedAt).toEqual(header.unbackedAt);
  });

  it("el backfill da un ítem a cada reserva anterior, de cualquier estado, y otra corrida no escribe nada", async () => {
    const f = await setup(10);
    const unbackedAt = new Date(Date.now() - DAY);
    await headerOnly(f, { quantity: 2 });
    await headerOnly(f, { quantity: 1, status: StockReservationStatus.RELEASED });
    await headerOnly(f, { quantity: 4, unbackedAt });
    await reserve(f, 1);
    const scope = { storeId: f.store.id };

    await expect(verifyReservationItems(testPrisma, scope)).resolves.toMatchObject({ reservations: 4, items: 1, withoutItems: 3, mismatched: 3 });
    const plan = await planReservationItemsBackfill(testPrisma, scope);
    expect(plan.missing).toHaveLength(3);
    await expect(applyReservationItemsBackfill(testPrisma, plan)).resolves.toBe(3);

    await expect(verifyReservationItems(testPrisma, scope)).resolves.toEqual({
      reservations: 4,
      items: 4,
      withoutItems: 0,
      mismatched: 0,
      byStatus: { ACTIVE: 3, RELEASED: 1 },
    });
    const flaggedItem = await testPrisma.stockReservationItem.findFirstOrThrow({ where: { storeId: f.store.id, quantity: 4 } });
    expect(flaggedItem.unbackedAt).toEqual(unbackedAt);

    const again = await planReservationItemsBackfill(testPrisma, scope);
    expect(again.missing).toHaveLength(0);
    await expect(applyReservationItemsBackfill(testPrisma, again)).resolves.toBe(0);
  });

  it("dos corridas a la vez con el mismo plan no duplican ítems", async () => {
    const f = await setup(10);
    await headerOnly(f, { quantity: 2 });
    await headerOnly(f, { quantity: 5 });
    const plan = await planReservationItemsBackfill(testPrisma, { storeId: f.store.id });

    const written = await Promise.all([applyReservationItemsBackfill(testPrisma, plan), applyReservationItemsBackfill(testPrisma, plan)]);

    expect(written[0] + written[1]).toBe(2);
    await expect(verifyReservationItems(testPrisma, { storeId: f.store.id })).resolves.toMatchObject({ items: 2, withoutItems: 0, mismatched: 0 });
  });
});
