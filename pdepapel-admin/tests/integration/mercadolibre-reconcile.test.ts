import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * #11: la revisión diaria compara cada publicación vinculada con Mercado
 * Libre. Corre el cron de verdad contra MySQL; Mercado Libre y Resend son
 * falsos. Solo arregla el stock (encolando), el estado local y el producto
 * de usuario que falte, y avisa lo demás una sola vez.
 */
const ml = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  sellerIds: [] as string[],
  orders: [] as string[],
  failItems: false as false | "503" | "timeout" | "401",
  resources: [] as string[],
}));
const resendSend = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/mercadolibre/queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/queue")>()),
  enqueueMercadoLibreOutboxEvent: enqueue,
}));
vi.mock("@/lib/mercadolibre/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mercadolibre/client")>();
  const respond = (resource: string) => {
    if (resource.includes("/items/search")) return { results: ml.sellerIds, paging: { total: ml.sellerIds.length } };
    if (resource.startsWith("/orders/search")) return { results: ml.orders.map((id) => ({ id: Number(id) })) };
    if (/^\/sites\/\w+\/listing_prices/.test(resource)) return { sale_fee_amount: Number(new URLSearchParams(resource.split("?")[1]).get("price")) * 0.16 };
    if (resource.includes("/shipping_options/free")) return { coverage: { all_country: { list_cost: 8200 } } };
    if (resource.startsWith("/items?ids=")) {
      const ids = decodeURIComponent(resource.slice("/items?ids=".length).split("&")[0]).split(",");
      return ml.items.filter((item) => ids.includes(String(item.id))).map((body) => ({ code: 200, body }));
    }
    return null;
  };
  return {
    ...actual,
    getMercadoLibreJson: async (_c: string, resource: string) => respond(resource),
    requestMercadoLibreJson: async (_c: string, resource: string) => {
      ml.resources.push(resource);
      if (ml.failItems && resource.startsWith("/items?ids=")) {
        if (ml.failItems === "401") throw new actual.MercadoLibreReauthError();
        if (ml.failItems === "timeout") throw new Error("The operation was aborted due to timeout");
        return { ok: false, status: 503, payload: null };
      }
      return { ok: true, status: 200, payload: respond(resource) };
    },
  };
});

import { processMercadoLibreHealthChecks } from "@/lib/mercadolibre/health-cron";
import { countOpenMercadoLibreAlerts } from "@/lib/mercadolibre/health-alerts";

describe("Revisión diaria contra Mercado Libre (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let connectionId = "";

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  beforeEach(() => {
    resendSend.mockReset();
    resendSend.mockResolvedValue({ data: { id: "em" }, error: null });
    enqueue.mockReset();
    enqueue.mockResolvedValue({ messageId: "m" });
    ml.items = [];
    ml.sellerIds = [];
    ml.orders = [];
    ml.failItems = false;
    ml.resources = [];
  });
  afterEach(async () => {
    if (connectionId) {
      await testPrisma.marketplaceAlertState.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceListing.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
      connectionId = "";
    }
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function seed() {
    fixture = await createInventoryFixture();
    await testPrisma.product.update({
      where: { id: fixture.component.id },
      data: { stock: 4, images: { create: [{ url: "https://res.cloudinary.com/demo/image/upload/cartuchera.jpg" }] } },
    });
    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId: fixture.store.id, provider: "MERCADOLIBRE", status: "CONNECTED", sellerId: `seller-${randomUUID()}` },
    });
    connectionId = connection.id;
    const listing = await testPrisma.marketplaceListing.create({
      data: {
        connectionId,
        productId: fixture.component.id,
        externalItemId: "MCO100",
        status: "ACTIVE",
        categoryId: "MCO1",
        marketplacePrice: 39900,
        stockSafetyBuffer: 1,
        lastSyncedStock: 3,
        syncPrice: true,
      },
    });
    ml.sellerIds = ["MCO100", "MCO200", "MCO300"];
    ml.items = [
      { id: "MCO100", status: "paused", sub_status: [], price: 45000, available_quantity: 5, user_product_id: "MCOU100", permalink: "https://ml/100" },
      { id: "MCO200", status: "active", sub_status: [], price: 20000, available_quantity: 2, user_product_id: "MCOU200", permalink: "https://ml/200" },
      { id: "MCO300", status: "paused", sub_status: [], price: 20000, available_quantity: 1, user_product_id: "MCOU300", permalink: "https://ml/300" },
    ];
    ml.orders = ["2000000001"];
    return { listing };
  }

  const subjects = () => resendSend.mock.calls.map((call) => (call[0] as { subject: string }).subject);
  const openKinds = async () =>
    (await testPrisma.marketplaceAlertState.findMany({ where: { connectionId, resolvedAt: null, kind: { not: "lock" } }, orderBy: { kind: "asc" } })).map((row) => row.kind);

  it("arregla solo lo permitido, avisa lo demás una vez y el panel lo muestra sin leer Mercado Libre", async () => {
    const { listing } = await seed();

    const first = await processMercadoLibreHealthChecks();

    expect(first.processed[0]).toMatchObject({ reconcile: "ok", applied: { stockResync: 1, statusUpdates: 1, userProductBackfill: 1 } });
    const after = await testPrisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after).toMatchObject({ status: "PAUSED", externalUserProductId: "MCOU100", marketplacePrice: 39900 });
    const outbox = await testPrisma.marketplaceOutboxEvent.findMany({ where: { connectionId } });
    expect(outbox.map((event) => [event.action, event.listingId])).toEqual([["SYNC_STOCK", listing.id]]);
    expect(enqueue).toHaveBeenCalled();

    expect(await openKinds()).toEqual(["ml_order_missing", "ml_price_mismatch", "ml_status_changed", "ml_unlinked_stock"]);
    expect(subjects()).toEqual(["Mercado Libre: 4 cosas para revisar"]);
    const html = String((resendSend.mock.calls[0][0] as { text: string }).text);
    expect(html).toContain("MCO200");
    expect(html).toContain("mercadolibre.com.co/ventas/2000000001/detalle");
    expect(await countOpenMercadoLibreAlerts(fixture!.store.id)).toBe(4);

    resendSend.mockClear();
    await processMercadoLibreHealthChecks();
    expect(resendSend).not.toHaveBeenCalled();
    // El cambio de estado se avisa una vez: el panel ya coincide y se cierra solo.
    expect(await openKinds()).toEqual(["ml_order_missing", "ml_price_mismatch", "ml_unlinked_stock"]);
  });

  it("marcar como revisado desde el panel no las cierra; solo baja el número del menú", async () => {
    await seed();
    await processMercadoLibreHealthChecks();
    const { setAlertsReviewed, identifyIssues } = await import("@/lib/mercadolibre/health-alerts");
    const { getMercadoLibreHealthSummary } = await import("@/lib/mercadolibre/health");
    const summary = await getMercadoLibreHealthSummary(connectionId, { includeFinancials: false });
    const issues = identifyIssues(summary.issues);
    expect(issues.filter((issue) => issue.kind.startsWith("ml_")).map((issue) => issue.title)).toContain("Publicación MCO200 sin vincular");

    await setAlertsReviewed(connectionId, issues, { keys: [issues.find((issue) => issue.kind === "ml_unlinked_stock")!.alertKey] }, true, { userId: "owner" });

    expect(await openKinds()).toEqual(["ml_order_missing", "ml_price_mismatch", "ml_status_changed", "ml_unlinked_stock"]);
    expect(await countOpenMercadoLibreAlerts(fixture!.store.id)).toBe(3);
  });

  it("si Mercado Libre no responde, conserva lo abierto, agrega «revisión incompleta», no arregla nada y el correo sale", async () => {
    const { listing } = await seed();
    await processMercadoLibreHealthChecks();
    resendSend.mockClear();
    await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { connectionId } });
    ml.failItems = "503";

    const run = await processMercadoLibreHealthChecks();

    expect(run.failed).toBe(0);
    expect(run.processed[0]).toMatchObject({ reconcile: "ok", applied: { stockResync: 0, statusUpdates: 0 } });
    expect(await openKinds()).toEqual(["ml_order_missing", "ml_price_mismatch", "ml_status_changed", "ml_unchecked", "ml_unlinked_stock"]);
    expect(subjects()).toEqual(["Mercado Libre: 1 cosa para revisar"]);
    expect(await testPrisma.marketplaceOutboxEvent.count({ where: { connectionId } })).toBe(0);
    expect((await testPrisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("PAUSED");
  });

  it("cuando todo coincide, cierra las alertas y no manda correo", async () => {
    const { listing } = await seed();
    await processMercadoLibreHealthChecks();
    resendSend.mockClear();
    ml.items = [{ id: "MCO100", status: "paused", sub_status: [], price: 39900, available_quantity: 3, user_product_id: "MCOU100", permalink: "https://ml/100" }];
    ml.sellerIds = ["MCO100"];
    ml.orders = [];
    await testPrisma.marketplaceListing.update({ where: { id: listing.id }, data: { status: "PAUSED" } });

    await processMercadoLibreHealthChecks();

    expect(resendSend).not.toHaveBeenCalled();
    expect(await openKinds()).toEqual([]);
    expect(await countOpenMercadoLibreAlerts(fixture!.store.id)).toBe(0);
  });

  describe("tipo de publicación y categoría al día con Mercado Libre", () => {
    const listingNow = (id: string) => testPrisma.marketplaceListing.findUniqueOrThrow({ where: { id } });

    it("sin cambios no escribe; un tipo distinto se pone al día y se cuenta", async () => {
      const { listing } = await seed();
      await testPrisma.marketplaceListing.update({ where: { id: listing.id }, data: { listingType: "gold_special" } });
      ml.items[0] = { ...ml.items[0], listing_type_id: "gold_special", category_id: "MCO1" };

      const same = await processMercadoLibreHealthChecks();
      expect(same.processed[0]).toMatchObject({ applied: { typeRefreshed: 0, siteFallback: 0 } });
      expect(ml.resources.find((resource) => resource.startsWith("/items?ids="))).toContain("listing_type_id,category_id");
      const unchanged = await listingNow(listing.id);
      expect([unchanged.listingType, unchanged.categoryId]).toEqual(["gold_special", "MCO1"]);

      await testPrisma.marketplaceAlertState.deleteMany({ where: { connectionId } });
      ml.items[0] = { ...ml.items[0], listing_type_id: "gold_pro", category_id: "MCO2" };
      const changed = await processMercadoLibreHealthChecks();
      expect(changed.processed[0]).toMatchObject({ applied: { typeRefreshed: 1 } });
      expect(await listingNow(listing.id)).toMatchObject({ listingType: "gold_pro", categoryId: "MCO2" });
    });

    for (const failure of ["401", "timeout"] as const) {
      it(`con ${failure === "401" ? "un 401" : "una demora"} al leer las publicaciones no escribe nada`, async () => {
        const { listing } = await seed();
        await testPrisma.marketplaceListing.update({ where: { id: listing.id }, data: { listingType: "gold_special" } });
        ml.items[0] = { ...ml.items[0], listing_type_id: "gold_pro", category_id: "MCO2" };
        ml.failItems = failure;

        const run = await processMercadoLibreHealthChecks();

        expect(run.processed[0].reconcile).toBe(failure === "401" ? "reauth" : "ok");
        if (failure === "timeout") expect(run.processed[0]).toMatchObject({ applied: { typeRefreshed: 0 } });
        expect(await listingNow(listing.id)).toMatchObject({ listingType: "gold_special", categoryId: "MCO1" });
      });
    }

    it("la comisión se pide al sitio de la conexión; sin sitio usa MCO y lo cuenta", async () => {
      const { listing } = await seed();
      await testPrisma.marketplaceListing.update({ where: { id: listing.id }, data: { syncPrice: false } });
      ml.items[0] = { ...ml.items[0], price: 60000 };
      await testPrisma.marketplaceConnection.update({ where: { id: connectionId }, data: { siteId: "MLA" } });

      const other = await processMercadoLibreHealthChecks();
      expect(other.processed[0]).toMatchObject({ applied: { siteFallback: 0 } });
      expect(ml.resources.some((resource) => resource.startsWith("/sites/MLA/listing_prices"))).toBe(true);
      expect(ml.resources.some((resource) => resource.startsWith("/sites/MCO/"))).toBe(false);

      await testPrisma.marketplaceListing.update({ where: { id: listing.id }, data: { marketplacePrice: 39900 } });
      await testPrisma.marketplaceAlertState.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceConnection.update({ where: { id: connectionId }, data: { siteId: "" } });
      ml.resources = [];
      const fallback = await processMercadoLibreHealthChecks();
      expect(fallback.processed[0]).toMatchObject({ applied: { siteFallback: 1 } });
      expect(ml.resources.some((resource) => resource.startsWith("/sites/MCO/listing_prices"))).toBe(true);
    });
  });

  it("con la sincronización de precio apagada copia el precio de Mercado Libre en silencio si cumple el margen", async () => {
    const { listing } = await seed();
    await testPrisma.marketplaceListing.update({ where: { id: listing.id }, data: { syncPrice: false } });
    ml.items[0] = { ...ml.items[0], price: 60000 };

    const run = await processMercadoLibreHealthChecks();

    expect(run.processed[0]).toMatchObject({ applied: { priceMirrored: 1 } });
    expect(await testPrisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ marketplacePrice: 60000, lastSyncedPrice: 60000 });
    expect(await openKinds()).not.toContain("ml_price_mismatch");
    expect(await openKinds()).not.toContain("ml_price_below_margin");
  });

  it("si ese precio queda por debajo del margen no se copia y queda la alerta", async () => {
    const { listing } = await seed();
    await testPrisma.marketplaceListing.update({ where: { id: listing.id }, data: { syncPrice: false } });
    await testPrisma.product.update({ where: { id: fixture!.component.id }, data: { acqPrice: 30000 } });

    const run = await processMercadoLibreHealthChecks();

    expect(run.processed[0]).toMatchObject({ applied: { priceMirrored: 0 } });
    expect((await testPrisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).marketplacePrice).toBe(39900);
    expect(await openKinds()).toContain("ml_price_below_margin");
    expect(await openKinds()).not.toContain("ml_price_mismatch");
  });
});
