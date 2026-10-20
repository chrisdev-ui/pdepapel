import { CapsuleSlipKind, CapsuleSlipStatus } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import { ErrorFactory } from "@/lib/api-errors";
import { maxGiftCostOf, maxPackFor, packMargins, packRungs, type CapsulePackCosts } from "@/lib/pricing/capsules";
import prismadb from "@/lib/prismadb";
import { DEFAULT_SLOW_DAYS, isSlowMover, loadFirstStockedAt, loadSalesHistory, stockedSinceOf, unitCostOf } from "@/lib/sales-velocity";

/**
 * La bolsa de una edición: qué productos pueden ser papeles (por categoría y
 * dentro de la banda de costo), cuáles pueden ser regalos (productos quietos
 * dentro del tope de regalo más alto de los packs) y si una bolsa propuesta
 * deja cada pack por encima del margen mínimo de la tienda en su P95.
 */

const CANDIDATE_SELECT = {
  id: true,
  name: true,
  sku: true,
  stock: true,
  reservedUnits: true,
  acqPrice: true,
  transportationCost: true,
  isKit: true,
  isArchived: true,
  createdAt: true,
  category: { select: { name: true } },
} as const;

async function loadEdition(storeId: string, editionId: string) {
  const edition = await prismadb.capsuleEdition.findFirst({ where: { id: editionId, storeId }, include: { packOptions: true } });
  if (!edition) throw ErrorFactory.NotFound("Edición no encontrada");
  return edition;
}

async function printedByProduct(editionId: string, kind: CapsuleSlipKind) {
  const rows = await prismadb.capsuleSlip.groupBy({ by: ["productId"], where: { editionId, kind, status: CapsuleSlipStatus.PRINTED }, _count: { _all: true } });
  return new Map(rows.map((row) => [row.productId, row._count._all]));
}

/** Productos de las categorías elegidas con costo dentro de la banda y algo disponible para apartar. */
export async function slipCandidates({ storeId, editionId, categoryIds }: { storeId: string; editionId: string; categoryIds: string[] }) {
  if (categoryIds.length === 0) throw ErrorFactory.InvalidRequest("Elige al menos una categoría");
  const edition = await loadEdition(storeId, editionId);
  const [products, printed] = await Promise.all([
    prismadb.product.findMany({
      where: {
        storeId,
        categoryId: { in: categoryIds },
        isArchived: false,
        isKit: false,
        capsuleEdition: { is: null },
        acqPrice: { gte: edition.costBandMin, lte: edition.costBandMax },
      },
      select: CANDIDATE_SELECT,
      orderBy: { name: "asc" },
    }),
    printedByProduct(editionId, CapsuleSlipKind.SLIP),
  ]);
  return products
    .map((product) => ({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      categoryName: product.category?.name ?? null,
      unitCost: Number(product.acqPrice),
      available: availableStock(product),
      printed: printed.get(product.id) ?? 0,
    }))
    .filter((row) => row.available > 0 || row.printed > 0);
}

/**
 * Regalos: productos quietos (sin ventas en la ventana de lentos) con costo
 * registrado hasta el tope de regalo más alto de los packs de la edición.
 */
export async function giftCandidates({ storeId, editionId, now = new Date() }: { storeId: string; editionId: string; now?: Date }) {
  const edition = await loadEdition(storeId, editionId);
  const cap = maxGiftCostOf(edition.packOptions);
  if (cap <= 0) throw ErrorFactory.InvalidRequest("Configura el regalo de los packs de la edición antes de elegir regalos");
  const [products, history, firstStocked, printed] = await Promise.all([
    prismadb.product.findMany({
      where: { storeId, isArchived: false, isKit: false, capsuleEdition: { is: null }, acqPrice: { gt: 0, lte: cap } },
      select: CANDIDATE_SELECT,
      orderBy: { name: "asc" },
    }),
    loadSalesHistory(prismadb, storeId, { days: DEFAULT_SLOW_DAYS, now }),
    loadFirstStockedAt(prismadb, storeId),
    printedByProduct(editionId, CapsuleSlipKind.GIFT),
  ]);
  return products
    .filter((product) => isSlowMover({ ...product, stockedSince: stockedSinceOf(firstStocked, product), unitCost: unitCostOf(product) }, history.get(product.id), DEFAULT_SLOW_DAYS, now))
    .map((product) => ({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      categoryName: product.category?.name ?? null,
      unitCost: Number(product.acqPrice),
      available: availableStock(product),
      printed: printed.get(product.id) ?? 0,
    }));
}

export interface PoolLine {
  productId: string;
  quantity: number;
}

export interface PackCheck {
  packSize: number;
  total: number;
  /** El pack cabe en la bolsa (≤ 25 % de los papeles). */
  available: boolean;
  expectedPct: number | null;
  p95Pct: number | null;
  worstPct: number | null;
  /** P95 ≥ el piso (de la edición o de la tienda); null si no hay piso o el pack no cabe. */
  passes: boolean | null;
}

const pct = (value: number) => Math.round(value * 1000) / 10;

/**
 * El margen de cada pack sobre la bolsa: los papeles ya impresos y sin anular
 * más los propuestos (al costo de hoy). El piso es el de la edición
 * (`minMarginPct`) o, sin él, el margen mínimo de la tienda; nunca una cifra
 * del código.
 */
export async function checkPoolMargins({
  storeId,
  editionId,
  proposed = [],
  packOptions,
  runs = 5000,
}: {
  storeId: string;
  editionId: string;
  proposed?: PoolLine[];
  packOptions?: CapsulePackCosts[];
  runs?: number;
}) {
  const edition = await loadEdition(storeId, editionId);
  const options = packOptions ?? edition.packOptions;
  if (options.length === 0) throw ErrorFactory.InvalidRequest("Configura los packs de la edición antes de revisar el margen");
  const rungs = packRungs(options);

  const [printed, proposedProducts, store] = await Promise.all([
    prismadb.capsuleSlip.findMany({ where: { editionId, kind: CapsuleSlipKind.SLIP, status: { not: CapsuleSlipStatus.VOID } }, select: { unitCost: true } }),
    proposed.length
      ? prismadb.product.findMany({ where: { storeId, id: { in: proposed.map((line) => line.productId) } }, select: { id: true, acqPrice: true } })
      : Promise.resolve([]),
    prismadb.store.findUnique({ where: { id: storeId }, select: { storeMinMarginPercent: true } }),
  ]);
  const costById = new Map(proposedProducts.map((product) => [product.id, Number(product.acqPrice)]));
  const pool = printed.map((slip) => slip.unitCost);
  for (const line of proposed) {
    const cost = costById.get(line.productId);
    if (cost === undefined || !(cost > 0)) throw ErrorFactory.InvalidRequest("Un producto de la bolsa no existe o no tiene costo");
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw ErrorFactory.InvalidRequest("La cantidad de cada producto debe ser un entero mayor a cero");
    for (let unit = 0; unit < line.quantity; unit += 1) pool.push(cost);
  }

  // El piso de la edición manda; sin él, el margen mínimo de la tienda.
  const minMarginPct = edition.minMarginPct ?? store?.storeMinMarginPercent ?? null;
  const floorSource: "edition" | "store" | null = edition.minMarginPct !== null ? "edition" : minMarginPct !== null ? "store" : null;
  const largest = maxPackFor(pool.length);
  const packs: PackCheck[] = rungs.map((rung) => {
    if (largest === null || rung.packSize > largest) {
      return { packSize: rung.packSize, total: rung.total, available: false, expectedPct: null, p95Pct: null, worstPct: null, passes: null };
    }
    const result = packMargins({ pool, rung, runs, seed: 1 });
    const p95Pct = pct(result.p95);
    return {
      packSize: rung.packSize,
      total: rung.total,
      available: true,
      expectedPct: pct(result.expected),
      p95Pct,
      worstPct: pct(result.worst),
      passes: minMarginPct === null ? null : p95Pct >= minMarginPct,
    };
  });
  return { poolSize: pool.length, minMarginPct, floorSource, packs, ok: packs.every((pack) => pack.passes !== false) };
}
