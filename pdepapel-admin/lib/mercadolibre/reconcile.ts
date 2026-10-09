import type { MarketplaceListingStatus } from "@prisma/client";

import type { MercadoLibreHealthIssue } from "./health";
import { getMercadoLibreMarginBreakdown } from "./listing-margin";

/**
 * Revisión diaria contra Mercado Libre (#11). Compara cada publicación
 * vinculada con lo que Mercado Libre tiene y decide qué arreglar y qué
 * avisar. Solo arregla el stock (volviendo a encolar la sincronización), el
 * estado local (que refleja a Mercado Libre) y el producto de usuario que
 * falte; nunca escribe en Mercado Libre nada más.
 */

export const RECONCILE_KINDS = [
  "ml_price_mismatch",
  "ml_price_below_margin",
  "ml_status_changed",
  "ml_listing_review",
  "ml_twin_mismatch",
  "ml_unlinked_stock",
  "ml_order_missing",
  "ml_unchecked",
  "ml_reauth",
] as const;

export type ReconcileKind = (typeof RECONCILE_KINDS)[number];

export const isReconcileKind = (kind: string): kind is ReconcileKind =>
  (RECONCILE_KINDS as readonly string[]).includes(kind);

export type ReconcileRemoteItem = {
  id: string;
  status: string | null;
  subStatus: string[];
  price: number | null;
  originalPrice: number | null;
  availableQuantity: number | null;
  userProductId: string | null;
  permalink: string | null;
};

export type ReconcileListing = {
  id: string;
  productId: string;
  productName: string;
  externalItemId: string;
  externalVariationId: string | null;
  externalUserProductId: string | null;
  status: MarketplaceListingStatus;
  marketplacePrice: number | null;
  stockSafetyBuffer: number;
  syncStock: boolean;
  /** Apagada: Mercado Libre manda en el precio y el panel lo copia. */
  syncPrice: boolean;
  productStock: number;
  inPresale: boolean;
};

/** Precio que Mercado Libre tiene y el panel debería copiar (sincronización apagada). */
export type PriceMirror = { listingId: string; externalItemId: string; productId: string; from: number; to: number };

export type ReconcileResult = {
  issues: MercadoLibreHealthIssue[];
  priceMirrors: PriceMirror[];
  stockResyncProductIds: string[];
  statusUpdates: { externalItemId: string; status: string }[];
  userProductBackfill: { listingId: string; userProductId: string }[];
};

/** Estados locales que reflejan un ítem vivo; DRAFT, ERROR y UNLINKED no se tocan. */
const MIRRORED = new Set(["ACTIVE", "PAUSED", "CLOSED"]);
/** Lo que Mercado Libre hace solo y no pide nada: no se avisa. */
const ROUTINE_SUB_STATUS = new Set(["out_of_stock", "picture_download_pending"]);
/** Revisión o moderación: Mercado Libre pide algo. */
const REVIEW_SUB_STATUS = new Set(["waiting_for_patch", "forbidden", "held", "warning", "under_review"]);

const STATUS_LABEL: Record<string, string> = { active: "activa", paused: "pausada", closed: "cerrada" };

function mirroredRemoteStatus(status: string | null): "ACTIVE" | "PAUSED" | "CLOSED" | null {
  if (status === "active") return "ACTIVE";
  if (status === "closed") return "CLOSED";
  if (status === "paused" || status === "under_review" || status === "inactive" || status === "payment_required") return "PAUSED";
  return null;
}

export function describeReconcileIssue(
  kind: ReconcileKind,
  context: { productName?: string | null; itemId?: string | null; remoteStatus?: string | null; twinId?: string | null; unchecked?: number; ordersUnchecked?: boolean },
): Pick<MercadoLibreHealthIssue, "title" | "detail"> {
  const name = context.productName ?? (context.itemId ? `Publicación ${context.itemId}` : "Publicación de Mercado Libre");
  switch (kind) {
    case "ml_price_mismatch":
      return { title: name, detail: "El precio en Mercado Libre no coincide con el del panel. El panel no lo cambia: revisa cuál es el correcto." };
    case "ml_price_below_margin":
      return {
        title: name,
        detail: "El precio en Mercado Libre deja menos de la ganancia mínima de la tienda después del costo, la comisión y el envío. El panel no lo copió: revísalo.",
      };
    case "ml_status_changed":
      return {
        title: name,
        detail: `Mercado Libre la tiene ${STATUS_LABEL[context.remoteStatus ?? ""] ?? "con otro estado"}; el panel ya se actualizó.`,
      };
    case "ml_listing_review":
      return { title: name, detail: "Mercado Libre la tiene en revisión o pide un cambio. Ábrela en Mercado Libre para ver el motivo." };
    case "ml_twin_mismatch":
      return {
        title: name,
        detail: `Su gemela${context.twinId ? ` ${context.twinId}` : ""} en Mercado Libre no está en el mismo estado. Comparten stock y SKU: actívala o páusala allá.`,
      };
    case "ml_unlinked_stock":
      return {
        title: `Publicación ${context.itemId ?? ""} sin vincular`.trim(),
        detail: "Está activa en Mercado Libre con unidades, pero ningún producto del panel controla su stock. Vincúlala en «Importar existentes» o páusala.",
      };
    case "ml_order_missing":
      return {
        title: `Venta ${context.itemId ?? ""} sin registrar`.trim(),
        detail: "Mercado Libre la cobró en las últimas 48 horas y no llegó al panel, así que el inventario no se descontó. Re-sincronízala.",
      };
    case "ml_unchecked": {
      const parts = [
        context.unchecked ? `${context.unchecked} ${context.unchecked === 1 ? "publicación" : "publicaciones"}` : null,
        context.ordersUnchecked ? "las ventas de las últimas 48 horas" : null,
      ].filter(Boolean);
      return {
        title: "Revisión incompleta",
        detail: parts.length
          ? `Mercado Libre no respondió por ${parts.join(" ni por ")}; la revisión diaria lo vuelve a intentar mañana.`
          : "Mercado Libre no respondió por una parte de la revisión; se vuelve a intentar mañana.",
      };
    }
    case "ml_reauth":
      return { title: "Conexión vencida", detail: "La conexión con Mercado Libre se venció. Pídele a Christian que la reconecte." };
  }
}

export function computeReconcile({
  listings,
  remote,
  unavailableItemIds,
  recentPaidOrderIds,
  knownOrderIds,
  ordersUnchecked = false,
}: {
  listings: ReconcileListing[];
  remote: ReconcileRemoteItem[];
  unavailableItemIds: string[];
  recentPaidOrderIds: string[];
  knownOrderIds: string[];
  /** La búsqueda de ventas no respondió. */
  ordersUnchecked?: boolean;
}): ReconcileResult {
  const result: ReconcileResult = { issues: [], priceMirrors: [], stockResyncProductIds: [], statusUpdates: [], userProductBackfill: [] };
  const byId = new Map(remote.map((item) => [item.id, item]));
  const linkedIds = new Set(listings.map((listing) => listing.externalItemId));
  const linkedUps = new Set<string>();

  for (const listing of listings) {
    const item = byId.get(listing.externalItemId);
    if (!item) continue;
    const upId = listing.externalUserProductId ?? item.userProductId;
    if (upId) linkedUps.add(upId);
    if (!listing.externalUserProductId && item.userProductId) {
      result.userProductBackfill.push({ listingId: listing.id, userProductId: item.userProductId });
    }
    const base = { listingId: listing.id, productId: listing.productId, permalink: item.permalink, externalItemId: item.id };

    const remoteMirror = mirroredRemoteStatus(item.status);
    const subStatus = item.subStatus;
    const inReview =
      item.status === "under_review" || item.status === "inactive" || subStatus.some((value) => REVIEW_SUB_STATUS.has(value));
    if (inReview) {
      result.issues.push({
        kind: "ml_listing_review",
        ...describeReconcileIssue("ml_listing_review", { productName: listing.productName }),
        ...base,
        fingerprintParts: [item.status ?? "", ...[...subStatus].sort()],
      });
    }
    if (remoteMirror && MIRRORED.has(listing.status) && remoteMirror !== listing.status) {
      result.statusUpdates.push({ externalItemId: item.id, status: item.status! });
      const routine = subStatus.length > 0 && subStatus.every((value) => ROUTINE_SUB_STATUS.has(value));
      if (!routine && !inReview) {
        result.issues.push({
          kind: "ml_status_changed",
          ...describeReconcileIssue("ml_status_changed", { productName: listing.productName, remoteStatus: item.status }),
          ...base,
          fingerprintParts: [item.status ?? ""],
        });
      }
    }

    const referencePrice = item.originalPrice ?? item.price;
    if (listing.marketplacePrice !== null && referencePrice !== null && referencePrice !== listing.marketplacePrice && !listing.syncPrice) {
      result.priceMirrors.push({
        listingId: listing.id,
        externalItemId: item.id,
        productId: listing.productId,
        from: listing.marketplacePrice,
        to: referencePrice,
      });
    } else if (listing.marketplacePrice !== null && referencePrice !== null && referencePrice !== listing.marketplacePrice) {
      result.issues.push({
        kind: "ml_price_mismatch",
        ...describeReconcileIssue("ml_price_mismatch", { productName: listing.productName }),
        ...base,
        fingerprintParts: [referencePrice, listing.marketplacePrice],
      });
    }

    if (listing.syncStock && !listing.externalVariationId && item.status !== "closed" && item.availableQuantity !== null) {
      const target = listing.inPresale ? 0 : Math.max(0, listing.productStock - listing.stockSafetyBuffer);
      if (item.availableQuantity !== target) result.stockResyncProductIds.push(listing.productId);
    }

    if (upId) {
      for (const twin of remote) {
        if (twin.id === item.id || twin.userProductId !== upId || linkedIds.has(twin.id)) continue;
        if (twin.status !== item.status || twin.availableQuantity !== item.availableQuantity) {
          result.issues.push({
            kind: "ml_twin_mismatch",
            ...describeReconcileIssue("ml_twin_mismatch", { productName: listing.productName, twinId: twin.id }),
            ...base,
            entityId: `${listing.id}|${twin.id}`,
            externalItemId: twin.id,
            permalink: twin.permalink,
            fingerprintParts: [twin.status ?? "", item.status ?? ""],
          });
        }
      }
    }
  }

  for (const item of remote) {
    if (linkedIds.has(item.id) || (item.userProductId && linkedUps.has(item.userProductId))) continue;
    if (item.status !== "active" || !item.availableQuantity || item.availableQuantity <= 0) continue;
    result.issues.push({
      kind: "ml_unlinked_stock",
      ...describeReconcileIssue("ml_unlinked_stock", { itemId: item.id }),
      entityId: item.id,
      externalItemId: item.id,
      permalink: item.permalink,
      fingerprintParts: [],
    });
  }

  const known = new Set(knownOrderIds);
  for (const orderId of recentPaidOrderIds) {
    if (known.has(orderId)) continue;
    result.issues.push({
      kind: "ml_order_missing",
      ...describeReconcileIssue("ml_order_missing", { itemId: orderId }),
      entityId: orderId,
      externalOrderId: orderId,
      fingerprintParts: [],
    });
  }

  if (unavailableItemIds.length > 0 || ordersUnchecked) {
    result.issues.push({
      kind: "ml_unchecked",
      ...describeReconcileIssue("ml_unchecked", { unchecked: unavailableItemIds.length, ordersUnchecked }),
      fingerprintParts: [],
    });
  }

  result.stockResyncProductIds = Array.from(new Set(result.stockResyncProductIds));
  return result;
}

/**
 * ¿Se copia el precio de Mercado Libre al panel? Sí, salvo que deje menos
 * del mayor entre el margen objetivo y la ganancia mínima por unidad; ahí
 * queda una alerta. Sin costo registrado no hay piso que medir.
 */
export function decidePriceMirror({
  price,
  unitCost,
  feeAmount,
  shippingCost,
  targets,
}: {
  price: number;
  unitCost: number | null;
  feeAmount: number;
  shippingCost: number;
  targets: { targetMarginPercent: number; minNetPerUnit: number };
}): "mirror" | "below_margin" {
  const { net } = getMercadoLibreMarginBreakdown({ price, feeAmount, shippingCost, unitCost });
  if (net === null) return "mirror";
  const required = Math.max(targets.minNetPerUnit, (targets.targetMarginPercent / 100) * price);
  return net >= required ? "mirror" : "below_margin";
}
