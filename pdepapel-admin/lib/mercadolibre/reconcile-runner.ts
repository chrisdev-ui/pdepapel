import { ProductPresaleStatus } from "@prisma/client";

import { mapWithConcurrency } from "@/lib/concurrency";
import prismadb from "@/lib/prismadb";

import { MercadoLibreReauthError, requestMercadoLibreJson } from "./client";
import type { MercadoLibreHealthIssue } from "./health";
import { getSellerItemIds } from "./import-listings";
import { synchronizeMercadoLibreItemStatus } from "./item-sync";
import { enqueuePendingMarketplaceOutboxEvents, queueMarketplaceStockSyncEvents } from "./outbox";
import {
  computeReconcile,
  describeReconcileIssue,
  isReconcileKind,
  type ReconcileListing,
  type ReconcileRemoteItem,
} from "./reconcile";

const ITEM_BATCH_SIZE = 20;
const ITEM_BATCH_CONCURRENCY = 3;
const ORDER_PAGE_SIZE = 50;
const MAX_ORDER_PAGES = 4;
const ORDER_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Una venta recién pagada puede tener su aviso en camino: no se cuenta como perdida. */
const ORDER_GRACE_MS = 15 * 60 * 1000;
/** Lo que la revisión puede gastar leyendo Mercado Libre dentro de los 60 s de la función. */
export const RECONCILE_READ_BUDGET_MS = 30_000;
const ITEM_ATTRIBUTES = "id,status,sub_status,price,original_price,available_quantity,user_product_id,permalink";

export type ReconcileRun =
  | { outcome: "ok"; issues: MercadoLibreHealthIssue[]; unavailableItemIds: string[]; applied: ReconcileApplied }
  | { outcome: "reauth" }
  | { outcome: "failed"; error: string };

export type ReconcileApplied = { stockResync: number; statusUpdates: number; userProductBackfill: number };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const toNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const toText = (value: unknown) => (typeof value === "string" && value ? value : null);

export function parseReconcileItem(body: Record<string, unknown>): ReconcileRemoteItem | null {
  const id = toText(body.id);
  if (!id) return null;
  return {
    id,
    status: toText(body.status)?.toLowerCase() ?? null,
    subStatus: Array.isArray(body.sub_status) ? body.sub_status.filter((value): value is string => typeof value === "string") : [],
    price: toNumber(body.price),
    originalPrice: toNumber(body.original_price),
    availableQuantity: toNumber(body.available_quantity),
    userProductId: toText(body.user_product_id),
    permalink: toText(body.permalink),
  };
}

async function readItems(connectionId: string, ids: string[], deadline: number) {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += ITEM_BATCH_SIZE) batches.push(ids.slice(index, index + ITEM_BATCH_SIZE));
  const results = await mapWithConcurrency(batches, ITEM_BATCH_CONCURRENCY, async (batch) => {
    if (Date.now() > deadline) return { items: [] as ReconcileRemoteItem[], unavailable: batch };
    try {
      const response = await requestMercadoLibreJson(
        connectionId,
        `/items?ids=${batch.map(encodeURIComponent).join(",")}&attributes=${ITEM_ATTRIBUTES}`,
      );
      if (!response.ok || !Array.isArray(response.payload)) return { items: [], unavailable: batch };
      const items = response.payload.flatMap((entry) => {
        const record = asRecord(entry);
        const body = asRecord(record?.body);
        if (record?.code !== 200 || !body) return [];
        const parsed = parseReconcileItem(body);
        return parsed ? [parsed] : [];
      });
      const seen = new Set(items.map((item) => item.id));
      return { items, unavailable: batch.filter((id) => !seen.has(id)) };
    } catch (error) {
      if (error instanceof MercadoLibreReauthError) throw error;
      return { items: [], unavailable: batch };
    }
  });
  return {
    items: results.flatMap((result) => result.items),
    unavailable: results.flatMap((result) => result.unavailable),
  };
}

async function readRecentPaidOrderIds(connectionId: string, sellerId: string, now: Date): Promise<string[] | null> {
  const from = new Date(now.getTime() - ORDER_WINDOW_MS).toISOString();
  const to = new Date(now.getTime() - ORDER_GRACE_MS).toISOString();
  const ids: string[] = [];
  for (let page = 0; page < MAX_ORDER_PAGES; page += 1) {
    const response = await requestMercadoLibreJson(
      connectionId,
      `/orders/search?seller=${encodeURIComponent(sellerId)}&order.status=paid&order.date_created.from=${encodeURIComponent(from)}&order.date_created.to=${encodeURIComponent(to)}&limit=${ORDER_PAGE_SIZE}&offset=${page * ORDER_PAGE_SIZE}`,
    );
    const payload = asRecord(response.payload);
    if (!response.ok || !payload || !Array.isArray(payload.results)) return null;
    for (const order of payload.results) {
      const id = asRecord(order)?.id;
      if (typeof id === "number" || typeof id === "string") ids.push(String(id));
    }
    if (payload.results.length < ORDER_PAGE_SIZE) break;
  }
  return ids;
}

/**
 * Lee Mercado Libre y aplica solo los arreglos permitidos: volver a encolar
 * la sincronización de stock (camino normal, con el candado de preventa),
 * alinear el estado local con el de Mercado Libre (igual que el aviso
 * `items`) y guardar el producto de usuario que falte. Nada más se escribe,
 * y en Mercado Libre nada que no sea ese stock.
 */
export async function runMercadoLibreReconcile(
  connection: { id: string; sellerId: string | null },
  { now = new Date(), budgetMs = RECONCILE_READ_BUDGET_MS }: { now?: Date; budgetMs?: number } = {},
): Promise<ReconcileRun> {
  if (!connection.sellerId) return { outcome: "failed", error: "La conexión no tiene vendedor." };
  const deadline = Date.now() + budgetMs;
  try {
    const rows = await prismadb.marketplaceListing.findMany({
      where: { connectionId: connection.id, externalItemId: { not: null } },
      select: {
        id: true,
        productId: true,
        externalItemId: true,
        externalVariationId: true,
        externalUserProductId: true,
        status: true,
        marketplacePrice: true,
        stockSafetyBuffer: true,
        syncStock: true,
        product: { select: { name: true, stock: true } },
      },
    });
    const presales = await prismadb.productPresale.findMany({
      where: { productId: { in: rows.map((row) => row.productId) }, status: ProductPresaleStatus.ACTIVE },
      select: { productId: true },
    });
    const inPresale = new Set(presales.map((presale) => presale.productId));
    const listings: ReconcileListing[] = rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      externalItemId: row.externalItemId!,
      externalVariationId: row.externalVariationId,
      externalUserProductId: row.externalUserProductId,
      status: row.status,
      marketplacePrice: row.marketplacePrice,
      stockSafetyBuffer: row.stockSafetyBuffer,
      syncStock: row.syncStock,
      productStock: row.product.stock,
      inPresale: inPresale.has(row.productId),
    }));

    const sellerIds = await getSellerItemIds(connection.id, connection.sellerId);
    const ids = Array.from(new Set([...listings.map((listing) => listing.externalItemId), ...sellerIds]));
    const { items, unavailable } = await readItems(connection.id, ids, deadline);

    const recentPaidOrderIds = Date.now() > deadline ? null : await readRecentPaidOrderIds(connection.id, connection.sellerId, now);
    const knownOrderIds = recentPaidOrderIds?.length
      ? (
          await prismadb.marketplaceOrder.findMany({
            where: { connectionId: connection.id, externalOrderId: { in: recentPaidOrderIds } },
            select: { externalOrderId: true },
          })
        ).map((order) => order.externalOrderId)
      : [];

    const unavailableSet = new Set(unavailable);
    const result = computeReconcile({
      listings: listings.filter((listing) => !unavailableSet.has(listing.externalItemId)),
      remote: items,
      unavailableItemIds: unavailable,
      ordersUnchecked: recentPaidOrderIds === null,
      recentPaidOrderIds: recentPaidOrderIds ?? [],
      knownOrderIds,
    });

    for (const update of result.statusUpdates) {
      await synchronizeMercadoLibreItemStatus(connection.id, { id: update.externalItemId, status: update.status });
    }
    for (const backfill of result.userProductBackfill) {
      await prismadb.marketplaceListing.updateMany({
        where: { id: backfill.listingId, externalUserProductId: null },
        data: { externalUserProductId: backfill.userProductId },
      });
    }
    if (result.stockResyncProductIds.length > 0) {
      await queueMarketplaceStockSyncEvents(prismadb, result.stockResyncProductIds);
      await enqueuePendingMarketplaceOutboxEvents(connection.id);
    }
    return {
      outcome: "ok",
      issues: result.issues,
      unavailableItemIds: unavailable,
      applied: {
        stockResync: result.stockResyncProductIds.length,
        statusUpdates: result.statusUpdates.length,
        userProductBackfill: result.userProductBackfill.length,
      },
    };
  } catch (error) {
    if (error instanceof MercadoLibreReauthError) return { outcome: "reauth" };
    return { outcome: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Alertas de la revisión diaria que siguen abiertas, reconstruidas desde la
 * tabla de estados sin leer Mercado Libre: así el panel las muestra y
 * marcarlas como revisadas no las da por resueltas.
 */
export async function loadOpenReconcileIssues(connectionId: string): Promise<MercadoLibreHealthIssue[]> {
  const rows = await prismadb.marketplaceAlertState.findMany({
    where: { connectionId, resolvedAt: null, kind: { startsWith: "ml" } },
    select: { alertKey: true, kind: true, fingerprint: true },
    orderBy: { firstSeenAt: "asc" },
  });
  const open = rows.filter((row) => isReconcileKind(row.kind));
  const entityOf = (alertKey: string, kind: string) => (alertKey.startsWith(`${kind}:`) ? alertKey.slice(kind.length + 1) : null);
  const listingIds = open.flatMap((row) => {
    const entity = entityOf(row.alertKey, row.kind);
    if (!entity) return [];
    if (row.kind === "ml_twin_mismatch") return [entity.split("|")[0]];
    return ["ml_price_mismatch", "ml_status_changed", "ml_listing_review"].includes(row.kind) ? [entity] : [];
  });
  const listings = listingIds.length
    ? await prismadb.marketplaceListing.findMany({
        where: { id: { in: listingIds }, connectionId },
        select: { id: true, productId: true, status: true, externalItemId: true, externalPermalink: true, product: { select: { name: true } } },
      })
    : [];
  const byId = new Map(listings.map((listing) => [listing.id, listing]));

  return open.flatMap((row): MercadoLibreHealthIssue[] => {
    if (!isReconcileKind(row.kind)) return [];
    const kind = row.kind;
    const entity = entityOf(row.alertKey, kind);
    const [listingId, twinId] = kind === "ml_twin_mismatch" && entity ? entity.split("|") : [entity, null];
    const listing = listingId ? byId.get(listingId) : undefined;
    const isListingKind = ["ml_price_mismatch", "ml_status_changed", "ml_listing_review", "ml_twin_mismatch"].includes(kind);
    if (isListingKind && !listing) return [];
    const itemId = kind === "ml_unlinked_stock" || kind === "ml_order_missing" ? entity : null;
    return [
      {
        kind,
        ...describeReconcileIssue(kind, {
          productName: listing?.product.name,
          itemId,
          twinId,
          remoteStatus: listing?.status.toLowerCase(),
        }),
        ...(listing
          ? { listingId: listing.id, productId: listing.productId, permalink: listing.externalPermalink, externalItemId: twinId ?? listing.externalItemId ?? undefined }
          : {}),
        ...(kind === "ml_twin_mismatch" ? { entityId: entity ?? undefined } : {}),
        ...(kind === "ml_unlinked_stock" && itemId
          ? { entityId: itemId, externalItemId: itemId, permalink: `https://articulo.mercadolibre.com.co/${itemId.replace(/^MCO/, "MCO-")}` }
          : {}),
        ...(kind === "ml_order_missing" && itemId ? { entityId: itemId, externalOrderId: itemId } : {}),
        fingerprint: row.fingerprint,
      },
    ];
  });
}

/**
 * Las alertas de hoy: las de la base más las de la revisión. Si Mercado Libre
 * no respondió, las que ya estaban abiertas se mantienen (no hay cómo saber
 * si se resolvieron) y se agrega «revisión incompleta».
 */
export function mergeReconcileIssues(
  baseIssues: MercadoLibreHealthIssue[],
  run: ReconcileRun,
): MercadoLibreHealthIssue[] {
  const base = baseIssues.filter((issue) => !isReconcileKind(issue.kind));
  const stored = baseIssues.filter((issue) => isReconcileKind(issue.kind));
  if (run.outcome === "ok") {
    const unavailable = new Set(run.unavailableItemIds);
    const carried = stored.filter(
      (issue) => issue.kind !== "ml_unchecked" && issue.kind !== "ml_reauth" && issue.externalItemId && unavailable.has(issue.externalItemId),
    );
    const freshKeys = new Set(run.issues.map((issue) => `${issue.kind}:${issue.entityId ?? issue.listingId ?? ""}`));
    return [...base, ...run.issues, ...carried.filter((issue) => !freshKeys.has(`${issue.kind}:${issue.entityId ?? issue.listingId ?? ""}`))];
  }
  const kept = stored.filter((issue) => issue.kind !== "ml_unchecked" && issue.kind !== "ml_reauth");
  const extra: MercadoLibreHealthIssue =
    run.outcome === "reauth"
      ? { kind: "ml_reauth", ...describeReconcileIssue("ml_reauth", {}), fingerprintParts: [] }
      : { kind: "ml_unchecked", ...describeReconcileIssue("ml_unchecked", {}), fingerprintParts: [] };
  return [...base, ...kept, extra];
}
