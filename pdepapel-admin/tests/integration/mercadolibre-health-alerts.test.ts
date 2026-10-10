import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * #8: el aviso diario de Mercado Libre repetía las mismas alertas en cada
 * corrida y en el panel no había cómo marcarlas como revisadas. Aquí corre
 * el cron de verdad contra MySQL (alertas, estado, correo con Resend falso):
 * solo avisa lo nuevo o lo cambiado, nunca dos veces lo mismo, y lo revisado
 * queda callado hasta que cambie.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const resendSend = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: session.userId }) }));
// with-test-env.mjs fija NODE_ENV=development, y en desarrollo el aviso no sale.
vi.mock("@/lib/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<{ env: Record<string, unknown> }>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key) =>
        key === "NODE_ENV" ? "production" : key === "ADMIN_WEB_URL" ? "https://admin.test" : Reflect.get(target, key),
    }),
  };
});
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: resendSend } } }));
// La revisión contra Mercado Libre tiene su propia suite (mercadolibre-reconcile.test.ts).
vi.mock("@/lib/mercadolibre/reconcile-runner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/reconcile-runner")>()),
  runMercadoLibreReconcile: async () => ({
    outcome: "ok",
    issues: [],
    unavailableItemIds: [],
    applied: { stockResync: 0, statusUpdates: 0, userProductBackfill: 0 },
  }),
}));

import { processMercadoLibreHealthChecks } from "@/lib/mercadolibre/health-cron";

const json = (body: unknown) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("Mercado Libre health alerts: dedupe and review (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let connectionId = "";

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  beforeEach(() => {
    resendSend.mockReset();
    resendSend.mockResolvedValue({ data: { id: "em" }, error: null });
  });
  afterEach(async () => {
    if (connectionId) {
      await testPrisma.marketplaceAlertState.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceQuestion.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceOrderItem.deleteMany({ where: { marketplaceOrder: { connectionId } } });
      await testPrisma.marketplaceOrder.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceListing.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
      connectionId = "";
    }
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  /** Una publicación activa con 2 unidades escondidas por un colchón de 2: «stock en riesgo». */
  async function seed() {
    fixture = await createInventoryFixture();
    await testPrisma.product.update({
      where: { id: fixture.component.id },
      data: { stock: 2, images: { create: [{ url: "https://res.cloudinary.com/demo/image/upload/agenda.jpg" }] } },
    });
    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId: fixture.store.id, provider: "MERCADOLIBRE", status: "CONNECTED", sellerId: `seller-${randomUUID()}` },
    });
    connectionId = connection.id;
    const listing = await testPrisma.marketplaceListing.create({
      data: {
        connectionId,
        productId: fixture.component.id,
        externalItemId: `MCO${Date.now()}`,
        status: "ACTIVE",
        categoryId: "MCO1",
        marketplacePrice: 50000,
        stockSafetyBuffer: 2,
        lastSyncedStock: 0,
      },
    });
    return { listing };
  }

  const addQuestion = (text = "¿Lo tienen en rojo?") =>
    testPrisma.marketplaceQuestion.create({
      data: { connectionId, externalQuestionId: randomUUID(), externalItemId: "MCO1", status: "UNANSWERED", question: text },
    });

  const subjects = () => resendSend.mock.calls.map((call) => (call[0] as { subject: string }).subject);
  const texts = () => resendSend.mock.calls.map((call) => (call[0] as { text: string }).text);

  it("emails the open alert once; an unchanged second run (same day) sends nothing", async () => {
    await seed();

    const first = await processMercadoLibreHealthChecks();
    const second = await processMercadoLibreHealthChecks();

    expect(first.processed).toEqual([expect.objectContaining({ connectionId, issues: 1, notified: 1 })]);
    expect(second.processed).toEqual([expect.objectContaining({ connectionId, issues: 1, notified: 0 })]);
    expect(subjects()).toEqual(["Mercado Libre: 1 cosa para revisar"]);
    expect(texts()[0]).toContain("Stock en riesgo");
  });

  it("a new alert the same day is emailed alone, counting the known one", async () => {
    await seed();
    await processMercadoLibreHealthChecks();
    await addQuestion();

    const run = await processMercadoLibreHealthChecks();

    expect(run.processed).toEqual([expect.objectContaining({ connectionId, issues: 2, notified: 1 })]);
    expect(subjects()).toEqual(["Mercado Libre: 1 cosa para revisar", "Mercado Libre: 1 cosa para revisar"]);
    expect(texts()[1]).toContain("Preguntas sin responder");
    expect(texts()[1]).not.toContain("Stock en riesgo (");
    expect(texts()[1]).toContain("Además sigue abierta 1 alerta que ya conoces");
  });

  it("a changed alert (different stock) is emailed again", async () => {
    await seed();
    await processMercadoLibreHealthChecks();
    await testPrisma.product.update({ where: { id: fixture!.component.id }, data: { stock: 1 } });

    const run = await processMercadoLibreHealthChecks();

    expect(run.processed[0].notified).toBe(1);
    expect(resendSend).toHaveBeenCalledTimes(2);
    expect(resendSend.mock.calls[1][0]).toMatchObject({ to: ["avisos@prueba.test"] });
  });

  it("an alert marked as reviewed (API, owner) stays silent, and alerts again once it changes", async () => {
    await seed();
    session.userId = fixture!.store.userId;
    const { POST } = await import("@/app/api/[storeId]/marketplaces/mercadolibre/health/alerts/route");
    const { GET } = await import("@/app/api/[storeId]/marketplaces/mercadolibre/health/route");

    const review = await POST(json({ all: true }), { params: { storeId: fixture!.store.id } });
    expect(review.status).toBe(200);
    expect(await review.json()).toEqual({ updated: 1 });

    const panel = (await (await GET(new Request("http://admin.test"), { params: { storeId: fixture!.store.id } })).json()) as {
      issues: { kind: string; reviewed: boolean; alertKey: string }[];
    };
    expect(panel.issues).toEqual([expect.objectContaining({ kind: "stock_risk", reviewed: true })]);

    const silent = await processMercadoLibreHealthChecks();
    expect(silent.processed[0].notified).toBe(0);
    expect(resendSend).not.toHaveBeenCalled();

    await testPrisma.product.update({ where: { id: fixture!.component.id }, data: { stock: 1 } });
    const changed = await processMercadoLibreHealthChecks();
    expect(changed.processed[0].notified).toBe(1);
    expect(resendSend).toHaveBeenCalledTimes(1);

    // «Volver a mostrar»: la saca de revisadas.
    const undo = await POST(json({ keys: [panel.issues[0].alertKey], reviewed: false }), { params: { storeId: fixture!.store.id } });
    expect(await undo.json()).toEqual({ updated: 1 });
  });

  it("the review API is owner-only", async () => {
    await seed();
    const { POST } = await import("@/app/api/[storeId]/marketplaces/mercadolibre/health/alerts/route");

    session.userId = null;
    expect((await POST(json({ all: true }), { params: { storeId: fixture!.store.id } })).status).toBe(401);
    session.userId = "user_someone_else";
    expect((await POST(json({ all: true }), { params: { storeId: fixture!.store.id } })).status).toBe(403);
    session.userId = fixture!.store.userId;
    expect((await POST(json({ keys: [] }), { params: { storeId: fixture!.store.id } })).status).toBe(400);
    expect(await testPrisma.marketplaceAlertState.count({ where: { connectionId, dismissedAt: { not: null } } })).toBe(0);
  });

  it("five concurrent runs send one email", async () => {
    await seed();
    await addQuestion();

    const runs = await Promise.all(Array.from({ length: 5 }, () => processMercadoLibreHealthChecks()));

    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(runs.reduce((sum, run) => sum + run.processed.reduce((s, p) => s + p.notified, 0), 0)).toBe(2);
  });

  it("when Resend fails the alerts are given back and the next run sends them", async () => {
    await seed();
    resendSend.mockResolvedValue({ data: null, error: { name: "validation_error", message: "nope" } });

    const failed = await processMercadoLibreHealthChecks();
    expect(failed).toEqual({ processed: [], failed: 1 });

    resendSend.mockResolvedValue({ data: { id: "em" }, error: null });
    const retried = await processMercadoLibreHealthChecks();
    expect(retried.processed[0].notified).toBe(1);
    expect(resendSend).toHaveBeenCalledTimes(2);
  });

  it("an alert that resolves and comes back counts as new", async () => {
    await seed();
    await processMercadoLibreHealthChecks();
    await testPrisma.product.update({ where: { id: fixture!.component.id }, data: { stock: 9 } });
    const resolved = await processMercadoLibreHealthChecks();
    expect(resolved.processed[0]).toMatchObject({ issues: 0, notified: 0 });
    expect(await testPrisma.marketplaceAlertState.findFirstOrThrow({ where: { connectionId, kind: "stock_risk" } })).toMatchObject({ resolvedAt: expect.any(Date) });

    await testPrisma.product.update({ where: { id: fixture!.component.id }, data: { stock: 2 } });
    const back = await processMercadoLibreHealthChecks();

    expect(back.processed[0].notified).toBe(1);
    expect(resendSend).toHaveBeenCalledTimes(2);
  });

  /**
   * Las seis alertas del aviso del 2026-10-07, sembradas como estaban:
   * ninguna pedía nada y ya no salen.
   */
  it("today's six false alerts no longer appear", async () => {
    const { listing } = await seed();
    const { getMercadoLibreHealthSummary } = await import("@/lib/mercadolibre/health");
    // Owala: activa, producto archivado, cero ya enviado.
    await testPrisma.product.update({ where: { id: fixture!.component.id }, data: { stock: 0, isArchived: true } });
    await testPrisma.marketplaceListing.update({ where: { id: listing.id }, data: { stockSafetyBuffer: 0, lastSyncedStock: 0 } });
    // Graficolors: pausada, sin categoría, producto archivado.
    await testPrisma.product.update({ where: { id: fixture!.kit.id }, data: { stock: 0, isArchived: true } });
    await testPrisma.marketplaceListing.create({
      data: { connectionId, productId: fixture!.kit.id, externalItemId: `MCO${Date.now()}9`, status: "PAUSED", categoryId: null, marketplacePrice: 69000, lastSyncedStock: 0 },
    });
    // Venta cancelada que nunca descontó nada.
    await testPrisma.marketplaceOrder.create({
      data: {
        connectionId,
        externalOrderId: `${Date.now()}`,
        status: "CANCELLED",
        inventoryStatus: "EXCEPTION",
        inventoryError: "Sin relación local: Termo",
        paidAt: new Date("2026-08-12T03:29:24Z"),
        items: { create: [{ externalItemId: "MCO4139144402", title: "Termo", quantity: 1, unitPrice: 80000 }] },
      },
    });

    const summary = await getMercadoLibreHealthSummary(connectionId, { includeFinancials: false });

    expect(summary.issues).toEqual([]);
  });
});
