import { DiscountType, NewsletterSubscriberStatus, OrderStatus, OrderType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { requestNewsletterSubscription } from "@/lib/newsletter";
import {
  applyScannerConfirmedSuppression,
  deleteExpiredPendingNewsletterSignups,
  planScannerConfirmedSuppression,
} from "@/lib/newsletter-retention";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const NOW = new Date("2026-10-25T13:22:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("limpieza del boletín (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let secondFixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    for (const current of [secondFixture, fixture]) {
      if (current) {
        await testPrisma.order.deleteMany({ where: { storeId: current.store.id } });
        await deleteInventoryFixture(current);
      }
    }
    fixture = undefined;
    secondFixture = undefined;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const subscriber = (storeId: string, email: string, status: NewsletterSubscriberStatus, createdAt: Date, extra: Record<string, unknown> = {}) =>
    testPrisma.newsletterSubscriber.create({
      data: {
        storeId,
        email,
        emailNormalized: email,
        status,
        consentText: "Consentimiento de prueba",
        consentVersion: "test",
        createdAt,
        ...extra,
      },
    });

  it("borra solo las pendientes de más de 7 días sin enlace vigente y de la tienda pedida; activos y bajas no cambian", async () => {
    fixture = await createInventoryFixture();
    secondFixture = await createInventoryFixture();
    const storeId = fixture.store.id;
    const oldPending = await subscriber(storeId, "vieja@prueba.test", NewsletterSubscriberStatus.PENDING, daysAgo(8));
    const freshPending = await subscriber(storeId, "nueva@prueba.test", NewsletterSubscriberStatus.PENDING, daysAgo(6));
    const oldWithLiveLink = await subscriber(storeId, "volvio@prueba.test", NewsletterSubscriberStatus.PENDING, daysAgo(9), { confirmationExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000) });
    const oldActive = await subscriber(storeId, "activa@prueba.test", NewsletterSubscriberStatus.ACTIVE, daysAgo(30));
    const oldUnsubscribed = await subscriber(storeId, "baja@prueba.test", NewsletterSubscriberStatus.UNSUBSCRIBED, daysAgo(30));
    const otherStore = await subscriber(secondFixture.store.id, "otra@prueba.test", NewsletterSubscriberStatus.PENDING, daysAgo(30));
    const activeBefore = await testPrisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: oldActive.id } });

    const dryRun = await deleteExpiredPendingNewsletterSignups(testPrisma, { storeId, now: NOW, dryRun: true });
    expect(dryRun).toMatchObject({ matched: 1, deleted: 0 });
    expect(await testPrisma.newsletterSubscriber.count({ where: { storeId } })).toBe(5);

    const applied = await deleteExpiredPendingNewsletterSignups(testPrisma, { storeId, now: NOW });
    expect(applied).toMatchObject({ matched: 1, deleted: 1 });
    const left = await testPrisma.newsletterSubscriber.findMany({ where: { id: { in: [oldPending.id, freshPending.id, oldWithLiveLink.id, oldActive.id, oldUnsubscribed.id, otherStore.id] } }, select: { id: true } });
    expect(left.map((row) => row.id).sort()).toEqual([freshPending.id, oldWithLiveLink.id, oldActive.id, oldUnsubscribed.id, otherStore.id].sort());
    expect(await testPrisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: oldActive.id } })).toEqual(activeBefore);
  });

  it("un activo guardado con puntos de Gmail no se duplica ni recibe otra confirmación", async () => {
    fixture = await createInventoryFixture();
    const storeId = fixture.store.id;
    const active = await subscriber(storeId, "j.ohn@gmail.com", NewsletterSubscriberStatus.ACTIVE, daysAgo(60));
    const before = await testPrisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: active.id } });

    for (const variant of ["john@gmail.com", "J.O.H.N+promo@googlemail.com", "j.ohn@gmail.com"]) {
      await expect(requestNewsletterSubscription({ storeId, email: variant, source: "/" })).resolves.toEqual({ accepted: true, confirmationSent: false });
    }
    expect(await testPrisma.newsletterSubscriber.count({ where: { storeId } })).toBe(1);
    expect(await testPrisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: active.id } })).toEqual(before);
  });

  it("una fila nueva de Gmail se guarda sin puntos ni +; la segunda variante cae en la misma fila y en el enfriamiento de 24 h", async () => {
    fixture = await createInventoryFixture();
    const storeId = fixture.store.id;

    await expect(requestNewsletterSubscription({ storeId, email: "Ma.Ria+boletin@gmail.com", source: "/" })).resolves.toEqual({ accepted: true, confirmationSent: true });
    await expect(requestNewsletterSubscription({ storeId, email: "maria@googlemail.com", source: "/" })).resolves.toEqual({ accepted: true, confirmationSent: false });

    const rows = await testPrisma.newsletterSubscriber.findMany({ where: { storeId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].emailNormalized).toBe("maria@gmail.com");

    await testPrisma.newsletterSubscriber.update({ where: { id: rows[0].id }, data: { lastConfirmationSentAt: new Date(Date.now() - 23 * 60 * 60 * 1000) } });
    await expect(requestNewsletterSubscription({ storeId, email: "maria@gmail.com", source: "/" })).resolves.toEqual({ accepted: true, confirmationSent: false });
    await testPrisma.newsletterSubscriber.update({ where: { id: rows[0].id }, data: { lastConfirmationSentAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    await expect(requestNewsletterSubscription({ storeId, email: "maria@gmail.com", source: "/" })).resolves.toEqual({ accepted: true, confirmationSent: true });
  });

  it("los activos desde el 10-08 confirmados antes del botón pasan a baja y solo sus cupones sin uso se desactivan; repetir no cambia nada", async () => {
    fixture = await createInventoryFixture();
    const storeId = fixture.store.id;
    const coupon = (code: string, usedCount = 0) =>
      testPrisma.coupon.create({
        data: { storeId, code: `${code}-${randomUUID().slice(0, 6)}`, type: DiscountType.PERCENTAGE, amount: 10, startDate: daysAgo(10), endDate: daysAgo(-20), maxUses: 1, usedCount, minOrderValue: 0 },
      });
    const unused = await coupon("SINUSO");
    const usedByCount = await coupon("USADO", 1);
    const usedOnOrder = await coupon("PEDIDO");
    await testPrisma.order.create({
      data: { storeId, orderNumber: `ORD-NL-${randomUUID().slice(0, 8)}`, status: OrderStatus.PAID, type: OrderType.STANDARD, subtotal: 10000, total: 9000, fullName: "Luisa Sánchez", phone: "+573009999999", email: "luisa@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000", couponId: usedOnOrder.id },
    });

    const scanner = await subscriber(storeId, "a@empresa.test", NewsletterSubscriberStatus.ACTIVE, new Date("2026-10-09T10:00:00Z"), { welcomeCouponId: unused.id, confirmedAt: new Date("2026-10-09T10:01:00Z") });
    const scannerUsed = await subscriber(storeId, "b@empresa.test", NewsletterSubscriberStatus.ACTIVE, new Date("2026-10-12T10:00:00Z"), { welcomeCouponId: usedByCount.id, confirmedAt: new Date("2026-10-12T10:01:00Z") });
    const scannerOrder = await subscriber(storeId, "c@empresa.test", NewsletterSubscriberStatus.ACTIVE, new Date("2026-10-20T10:00:00Z"), { welcomeCouponId: usedOnOrder.id, confirmedAt: new Date("2026-10-20T10:01:00Z") });
    const clickedAfterDeploy = await subscriber(storeId, "f@empresa.test", NewsletterSubscriberStatus.ACTIVE, new Date("2026-10-26T10:00:00Z"), { confirmedAt: new Date("2026-10-26T10:05:00Z") });
    const olderActive = await subscriber(storeId, "d@empresa.test", NewsletterSubscriberStatus.ACTIVE, new Date("2026-10-07T23:00:00Z"), { confirmedAt: new Date("2026-10-07T23:01:00Z") });
    const pendingRecent = await subscriber(storeId, "e@empresa.test", NewsletterSubscriberStatus.PENDING, new Date("2026-10-15T10:00:00Z"));
    const olderBefore = await testPrisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: olderActive.id } });

    const confirmedBefore = new Date("2026-10-26T00:00:00Z");
    const plan = await planScannerConfirmedSuppression(testPrisma, { storeId, confirmedBefore });
    expect(plan.subscriberIds.sort()).toEqual([scanner.id, scannerUsed.id, scannerOrder.id].sort());
    expect(plan.couponIdsToDeactivate).toEqual([unused.id]);
    expect(plan.usedCouponIds.sort()).toEqual([usedByCount.id, usedOnOrder.id].sort());

    const written = await testPrisma.$transaction((tx) => applyScannerConfirmedSuppression(tx, plan, { storeId, now: NOW }));
    expect(written).toEqual({ unsubscribed: 3, couponsDeactivated: 1 });
    const after = await testPrisma.newsletterSubscriber.findMany({ where: { id: { in: plan.subscriberIds } } });
    expect(after.every((row) => row.status === NewsletterSubscriberStatus.UNSUBSCRIBED && row.unsubscribedAt?.getTime() === NOW.getTime())).toBe(true);
    expect((await testPrisma.coupon.findUniqueOrThrow({ where: { id: unused.id } })).isActive).toBe(false);
    expect((await testPrisma.coupon.findUniqueOrThrow({ where: { id: usedByCount.id } })).isActive).toBe(true);
    expect((await testPrisma.coupon.findUniqueOrThrow({ where: { id: usedOnOrder.id } })).isActive).toBe(true);
    expect(await testPrisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: olderActive.id } })).toEqual(olderBefore);
    expect((await testPrisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: pendingRecent.id } })).status).toBe(NewsletterSubscriberStatus.PENDING);

    await expect(applyScannerConfirmedSuppression(testPrisma, plan, { storeId })).resolves.toEqual({ unsubscribed: 0, couponsDeactivated: 0 });
    await expect(planScannerConfirmedSuppression(testPrisma, { storeId, confirmedBefore })).resolves.toMatchObject({ subscriberIds: [] });
    expect((await testPrisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: clickedAfterDeploy.id } })).status).toBe(NewsletterSubscriberStatus.ACTIVE);
  });
});
