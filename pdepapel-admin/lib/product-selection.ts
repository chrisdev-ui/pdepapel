import type { Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { getActiveOffers } from "@/lib/discount-engine";
import type { ActiveOffer } from "@/lib/offer-pricing";
import { partitionForBulk, summarizeSkipped, type ProductBulkAction } from "@/lib/product-bulk";
import { effectiveStock, loadProductListRows, matchProducts } from "@/lib/product-list";
import { parseProductListQuery, writeProductListQuery } from "@/lib/product-list-query";
import { resolveLowStockThreshold } from "@/lib/product-readiness";
import prismadb from "@/lib/prismadb";

/**
 * «Seleccionar los N de este filtro»: la selección no viaja como ids desde el
 * navegador; viaja la consulta de la lista (pestaña, búsqueda, orden y
 * filtros) y el servidor la vuelve a correr con las mismas reglas que pintan
 * la lista. Al aplicar se exige que siga siendo el mismo número que se
 * confirmó: si la lista cambió entre tanto, no se toca nada.
 */
export const MAX_SELECTION = 5000;
export const SELECTION_CHANGED = "SELECTION_CHANGED";

export interface ProductSelectionMatch {
  /** La consulta de la lista tal como está en la URL. */
  query: string;
  /** Cuántos confirmó quien aplica; si ya no son esos, no se aplica. */
  expectedCount?: number;
}

export async function resolveMatchingProductIds(storeId: string, match: ProductSelectionMatch): Promise<string[]> {
  const query = parseProductListQuery(writeProductListQuery(parseProductListQuery(new URLSearchParams(match.query))));
  const [store, offers] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { lowStockThreshold: true } }),
    getActiveOffers(storeId) as Promise<unknown> as Promise<ActiveOffer[]>,
  ]);
  const { rows, ctx } = await loadProductListRows(prismadb, storeId, { offers, threshold: resolveLowStockThreshold(store) });
  const ids = matchProducts(rows, query, ctx).matching.map((item) => item.row.id);
  if (ids.length > MAX_SELECTION) throw ErrorFactory.InvalidRequest(`Son ${ids.length} productos: el máximo en lote es ${MAX_SELECTION}. Filtra un poco más.`);
  if (match.expectedCount !== undefined && ids.length !== match.expectedCount) {
    throw ErrorFactory.Conflict(
      `La lista cambió: ahora son ${ids.length} ${ids.length === 1 ? "producto" : "productos"}, no ${match.expectedCount}. Revisa y confirma de nuevo.`,
      { code: SELECTION_CHANGED, count: ids.length },
    );
  }
  return ids;
}

export const BULK_ROW_SELECT = {
  id: true,
  name: true,
  sku: true,
  isArchived: true,
  isFeatured: true,
  gtin: true,
  mpn: true,
  hasNoProductIdentifier: true,
  availableAt: true,
  productGroupId: true,
  brandId: true,
  price: true,
  stock: true,
  isKit: true,
  kitComponents: { select: { quantity: true, component: { select: { stock: true } } } },
  category: { select: { name: true } },
  productGroup: { select: { name: true } },
} satisfies Prisma.ProductSelect;

/** Las filas para decidir omisiones y exportar; `stock` es el de la lista (un kit, el de sus piezas). */
export async function loadBulkRows(storeId: string, ids: string[]) {
  const rows = ids.length ? await prismadb.product.findMany({ where: { storeId, id: { in: ids } }, select: BULK_ROW_SELECT }) : [];
  return rows.map((row) => ({ ...row, stock: effectiveStock(row) }));
}

const ACTIONS: ProductBulkAction[] = ["archive", "restore", "feature", "unfeature", "mark-no-identifier", "unmark-no-identifier", "coming-soon", "available-now"];

/** Lo que muestra la barra con «los N de este filtro»: cuántos cambian con cada acción. */
export async function summarizeSelection(storeId: string, match: ProductSelectionMatch) {
  const ids = await resolveMatchingProductIds(storeId, match);
  const rows = await loadBulkRows(storeId, ids);
  return {
    count: ids.length,
    withBrand: rows.filter((row) => row.brandId).length,
    groups: new Set(rows.map((row) => row.productGroupId).filter(Boolean)).size,
    actions: Object.fromEntries(
      ACTIONS.map((action) => {
        const partition = partitionForBulk(rows, action);
        return [action, { eligible: partition.eligible.length, skipped: summarizeSkipped(partition.skipped) }];
      }),
    ) as Record<ProductBulkAction, { eligible: number; skipped: { reason: string; count: number }[] }>,
  };
}

export type ProductSelectionSummary = Awaited<ReturnType<typeof summarizeSelection>>;
