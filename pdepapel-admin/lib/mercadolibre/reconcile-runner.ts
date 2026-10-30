import { availableStock } from "@/lib/available-stock";
import { loadMercadoLibrePresaleBlocked, loadMercadoLibreSellable } from "@/lib/mercadolibre/available-quantity";

import { mapWithConcurrency } from "@/lib/concurrency";
import prismadb from "@/lib/prismadb";

import { MercadoLibreReauthError, MercadoLibreRequestError, requestMercadoLibreJson } from "./client";
import type { MercadoLibreHealthIssue } from "./health";
import { getSellerItemIds } from "./import-listings";
import { synchronizeMercadoLibreItemStatus } from "./item-sync";
import { enqueuePendingMarketplaceOutboxEvents, queueMarketplaceStockSyncEvents } from "./outbox";
import { getUnitCostFloor } from "@/lib/product-costs";

import { feeSourceFromQuote, type SaleFeeSource } from "@/lib/pricing/mercadolibre-fees";

import { MERCADOLIBRE_SHIPPING_ESTIMATE } from "./listing-margin";
import { parseMercadoLibreListingPriceEstimate } from "./listing-pricing";
import {
  computeReconcile,
  decidePriceMirror,
  describeReconcileIssue,
  isReconcileKind,
  listingTypeRefreshes,
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
const ITEM_ATTRIBUTES = "id,status,sub_status,price,original_price,available_quantity,user_product_id,permalink,listing_type_id,category_id";

/** `siteId` viene de la conexión; sin él se usa MCO y se cuenta en `applied.siteFallback`. */
export type ReconcileConnection = { id: string; sellerId: string | null; storeId?: string; siteId?: string | null };

export type ReconcileRun =
  | { outcome: "ok"; issues: MercadoLibreHealthIssue[]; unavailableItemIds: string[]; applied: ReconcileApplied }
  | { outcome: "reauth" }
  | { outcome: "failed"; error: string };

export type ReconcileApplied = {
  stockResync: number;
  statusUpdates: number;
  userProductBackfill: number;
  priceMirrored: number;
  /** Publicaciones cuyo tipo o categoría se puso al día con Mercado Libre. */
  typeRefreshed: number;
  /** 1 si la conexión no tenía sitio y se usó MCO. */
  siteFallback: number;
};

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
    listingType: toText(body.listing_type_id),
    categoryId: toText(body.category_id),
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
 * Comisión y envío reales del precio que tiene Mercado Libre, para decidir
 * si copiarlo. Sin respuesta de Mercado Libre, la comisión es la del tipo de
 * publicación y el envío, el estimado de un paquete liviano: la misma regla
 * compartida de `lib/pricing/mercadolibre-fees.ts`.
 */
async function readSaleCosts(
  connection: { id: string; sellerId: string | null },
  siteId: string,
  itemId: string,
  price: number,
  categoryId: string | null,
  listingType: string | null,
): Promise<{ fee: SaleFeeSource; shippingCost: number }> {
  let fee: SaleFeeSource = { kind: "tipo", listingType };
  let shippingCost = MERCADOLIBRE_SHIPPING_ESTIMATE;
  try {
    if (categoryId) {
      const quote = await requestMercadoLibreJson(
        connection.id,
        `/sites/${encodeURIComponent(siteId)}/listing_prices?price=${price}&category_id=${encodeURIComponent(categoryId)}&listing_type_id=${encodeURIComponent(listingType || "gold_special")}`,
      );
      const real = quote.ok ? feeSourceFromQuote(parseMercadoLibreListingPriceEstimate(quote.payload), price) : null;
      if (real) fee = real;
    }
    if (connection.sellerId) {
      const shipping = await requestMercadoLibreJson(
        connection.id,
        `/users/${encodeURIComponent(connection.sellerId)}/shipping_options/free?item_id=${encodeURIComponent(itemId)}&item_price=${price}&listing_type_id=${encodeURIComponent(listingType || "gold_special")}&mode=me2&condition=new&free_shipping=true&verbose=true`,
      );
      const cost = toNumber(asRecord(asRecord(asRecord(shipping.payload)?.coverage)?.all_country)?.list_cost);
      if (shipping.ok && cost !== null) shippingCost = cost;
    }
  } catch (error) {
    if (error instanceof MercadoLibreReauthError) throw error;
  }
  return { fee, shippingCost };
}

/**
 * Lee Mercado Libre y aplica solo los arreglos permitidos: volver a encolar
 * la sincronización de stock (camino normal, con el candado de preventa),
 * alinear el estado local con el de Mercado Libre (igual que el aviso
 * `items`), guardar el producto de usuario que falte y, con la
 * sincronización de precio apagada, copiar el precio de Mercado Libre si
 * cumple el margen. Nada más se escribe,
 * y en Mercado Libre nada que no sea ese stock.
 */
/** Espera antes del único reintento por un 429, si Mercado Libre no dice cuánto. */
export const RECONCILE_RATE_LIMIT_BACKOFF_MS = 4_000;
/** Tope de esa espera: un `Retry-After` largo no se cumple, la revisión sigue mañana. */
const RECONCILE_RATE_LIMIT_MAX_WAIT_MS = 10_000;

function rateLimitWaitMs(error: unknown): number | null {
  const upstream = error instanceof MercadoLibreRequestError ? error.upstreamStatus : null;
  const text = error instanceof Error ? error.message : String(error);
  if (upstream !== 429 && !/local_rate_limited|too many requests|limitó las consultas/i.test(text)) return null;
  const retryAfter = Number((error as { details?: { retryAfterSeconds?: unknown } })?.details?.retryAfterSeconds);
  const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RECONCILE_RATE_LIMIT_BACKOFF_MS;
  return Math.min(wait, RECONCILE_RATE_LIMIT_MAX_WAIT_MS);
}

/**
 * La revisión diaria con un solo reintento si Mercado Libre la frena con un
 * 429 (lo que pida `Retry-After`, o una espera corta), dentro del mismo
 * presupuesto de lectura. Un segundo 429 la deja como fallida, como antes.
 */
export async function runMercadoLibreReconcile(
  connection: ReconcileConnection,
  options: { now?: Date; budgetMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ReconcileRun> {
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? RECONCILE_READ_BUDGET_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const first = await runReconcileOnce(connection, { now: options.now, budgetMs });
  if (first.outcome !== "failed" || first.rateLimitWaitMs === undefined) return stripRetryHint(first);
  const remaining = budgetMs - (Date.now() - startedAt) - first.rateLimitWaitMs;
  if (remaining < 5_000) return stripRetryHint(first);
  console.warn("[MERCADOLIBRE] La revisión diaria chocó con un 429; un reintento", { waitMs: first.rateLimitWaitMs });
  await sleep(first.rateLimitWaitMs);
  return stripRetryHint(await runReconcileOnce(connection, { now: options.now, budgetMs: remaining }));
}

type ReconcileAttempt = Exclude<ReconcileRun, { outcome: "failed" }> | { outcome: "failed"; error: string; rateLimitWaitMs?: number };

function stripRetryHint(run: ReconcileAttempt): ReconcileRun {
  if (run.outcome === "failed") return { outcome: "failed", error: run.error };
  return run;
}

async function runReconcileOnce(
  connection: ReconcileConnection,
  { now = new Date(), budgetMs = RECONCILE_READ_BUDGET_MS }: { now?: Date; budgetMs?: number } = {},
): Promise<ReconcileAttempt> {
  if (!connection.sellerId) return { outcome: "failed", error: "La conexión no tiene vendedor." };
  const deadline = Date.now() + budgetMs;
  const siteId = connection.siteId || "MCO";
  const siteFallback = connection.siteId ? 0 : 1;
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
        syncPrice: true,
        categoryId: true,
        listingType: true,
        product: { select: { name: true, stock: true, reservedUnits: true, acqPrice: true, transportationCost: true } },
      },
    });
    // La misma cuenta que la sincronización: sin ella, la conciliación volvería a subir lo que la otra bajó.
    const productIds = rows.map((row) => row.productId);
    const inPresale = await loadMercadoLibrePresaleBlocked(prismadb, productIds);
    const sellable = await loadMercadoLibreSellable(prismadb, productIds, inPresale);
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
      syncPrice: row.syncPrice,
      productStock: sellable.get(row.productId) ?? availableStock(row.product),
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

    // Tipo y categoría al día: solo de lo que Mercado Libre devolvió, y solo si nadie los cambió entretanto.
    let typeRefreshed = 0;
    for (const refresh of listingTypeRefreshes(
      rows.map((row) => ({ id: row.id, externalItemId: row.externalItemId!, listingType: row.listingType, categoryId: row.categoryId })),
      items,
    )) {
      const written = await prismadb.marketplaceListing.updateMany({
        where: { id: refresh.listingId, listingType: refresh.from.listingType, categoryId: refresh.from.categoryId },
        data: refresh.data,
      });
      typeRefreshed += written.count;
      if (written.count) {
        const row = rows.find((candidate) => candidate.id === refresh.listingId)!;
        row.listingType = refresh.data.listingType ?? row.listingType;
        row.categoryId = refresh.data.categoryId ?? row.categoryId;
      }
    }

    const unavailableSet = new Set(unavailable);
    const result = computeReconcile({
      listings: listings.filter((listing) => !unavailableSet.has(listing.externalItemId)),
      remote: items,
      unavailableItemIds: unavailable,
      ordersUnchecked: recentPaidOrderIds === null,
      recentPaidOrderIds: recentPaidOrderIds ?? [],
      knownOrderIds,
    });

    const priceIssues: MercadoLibreHealthIssue[] = [];
    let priceMirrored = 0;
    if (result.priceMirrors.length > 0) {
      const store = connection.storeId
        ? await prismadb.store.findUnique({
            where: { id: connection.storeId },
            select: {
              mercadoLibreTargetMarginPercent: true,
              mercadoLibreMinNetPerUnit: true,
              mercadoLibreLowPriceFixedFee: true,
              mercadoLibreFreeShippingMin: true,
            },
          })
        : null;
      const targets = {
        targetMarginPercent: store?.mercadoLibreTargetMarginPercent ?? 20,
        minNetPerUnit: store?.mercadoLibreMinNetPerUnit ?? 10_000,
        lowPriceFixedFee: store?.mercadoLibreLowPriceFixedFee ?? null,
        freeShippingMin: store?.mercadoLibreFreeShippingMin ?? null,
      };
      const rowById = new Map(rows.map((row) => [row.id, row]));
      for (const mirror of result.priceMirrors) {
        const row = rowById.get(mirror.listingId)!;
        const { fee, shippingCost } = await readSaleCosts(connection, siteId, mirror.externalItemId, mirror.to, row.categoryId, row.listingType);
        const decision = decidePriceMirror({ price: mirror.to, unitCost: getUnitCostFloor(row.product), fee, shippingCost, targets });
        if (decision === "mirror") {
          const written = await prismadb.marketplaceListing.updateMany({
            where: { id: mirror.listingId, marketplacePrice: mirror.from },
            data: { marketplacePrice: mirror.to, lastSyncedPrice: mirror.to },
          });
          priceMirrored += written.count;
        } else {
          const item = items.find((candidate) => candidate.id === mirror.externalItemId);
          priceIssues.push({
            kind: "ml_price_below_margin",
            ...describeReconcileIssue("ml_price_below_margin", { productName: row.product.name }),
            listingId: mirror.listingId,
            productId: mirror.productId,
            externalItemId: mirror.externalItemId,
            permalink: item?.permalink ?? null,
            fingerprintParts: [mirror.to],
          });
        }
      }
    }

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
      issues: [...result.issues, ...priceIssues],
      unavailableItemIds: unavailable,
      applied: {
        stockResync: result.stockResyncProductIds.length,
        statusUpdates: result.statusUpdates.length,
        userProductBackfill: result.userProductBackfill.length,
        priceMirrored,
        typeRefreshed,
        siteFallback,
      },
    };
  } catch (error) {
    if (error instanceof MercadoLibreReauthError) return { outcome: "reauth" };
    const wait = rateLimitWaitMs(error);
    return {
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
      ...(wait !== null ? { rateLimitWaitMs: wait } : {}),
    };
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
    return ["ml_price_mismatch", "ml_price_below_margin", "ml_status_changed", "ml_listing_review"].includes(row.kind) ? [entity] : [];
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
    const isListingKind = ["ml_price_mismatch", "ml_price_below_margin", "ml_status_changed", "ml_listing_review", "ml_twin_mismatch"].includes(kind);
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
