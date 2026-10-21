import { CapsuleSlipKind, CapsuleSlipStatus } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import { resolveCapsuleFloor } from "@/lib/capsule-floor";
import { idleReason, loadIdleProducts } from "@/lib/capsule-idle";
import { ErrorFactory } from "@/lib/api-errors";
import { evaluatePoolMargins, maxGiftCostOf, packRungs, type CapsulePackCosts } from "@/lib/pricing/capsules";
import prismadb from "@/lib/prismadb";

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

/**
 * Productos de las categorías elegidas con costo dentro de la banda y algo
 * disponible para apartar. Por defecto solo los quietos (la regla del
 * Copiloto): las cápsulas existen para mover lo que no se vende. Con
 * `onlyIdle: false` salen también los que sí se venden, marcados.
 */
export async function slipCandidates({ storeId, editionId, categoryIds, onlyIdle = true }: { storeId: string; editionId: string; categoryIds: string[]; onlyIdle?: boolean }) {
  if (categoryIds.length === 0) throw ErrorFactory.InvalidRequest("Elige al menos una categoría");
  const edition = await loadEdition(storeId, editionId);
  const [products, printed, idle] = await Promise.all([
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
    loadIdleProducts(storeId),
  ]);
  return products
    .map((product) => {
      const info = idle.get(product.id);
      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        categoryName: product.category?.name ?? null,
        unitCost: Number(product.acqPrice),
        available: availableStock(product),
        printed: printed.get(product.id) ?? 0,
        idle: info !== undefined,
        reason: info ? `${idleReason(info)} · cabe en la banda` : "Se vende: no está quieto",
        daysSinceLastSale: info?.daysSinceLastSale ?? null,
      };
    })
    .filter((row) => (row.available > 0 || row.printed > 0) && (!onlyIdle || row.idle || row.printed > 0))
    .sort((a, b) => Number(b.idle) - Number(a.idle) || (b.daysSinceLastSale ?? Infinity) - (a.daysSinceLastSale ?? Infinity) || a.name.localeCompare(b.name));
}

/**
 * Regalos: productos quietos (sin ventas en la ventana de lentos) con costo
 * registrado hasta el tope de regalo más alto de los packs de la edición.
 */
export async function giftCandidates({ storeId, editionId }: { storeId: string; editionId: string }) {
  const edition = await loadEdition(storeId, editionId);
  const cap = maxGiftCostOf(edition.packOptions);
  if (cap <= 0) throw ErrorFactory.InvalidRequest("Configura el regalo de los packs de la edición antes de elegir regalos");
  const [products, idle, printed] = await Promise.all([
    prismadb.product.findMany({
      where: { storeId, isArchived: false, isKit: false, capsuleEdition: { is: null }, acqPrice: { gt: 0, lte: cap } },
      select: CANDIDATE_SELECT,
      orderBy: { name: "asc" },
    }),
    loadIdleProducts(storeId),
    printedByProduct(editionId, CapsuleSlipKind.GIFT),
  ]);
  return products
    .filter((product) => idle.has(product.id))
    .map((product) => ({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      categoryName: product.category?.name ?? null,
      unitCost: Number(product.acqPrice),
      available: availableStock(product),
      printed: printed.get(product.id) ?? 0,
      idle: true,
      reason: idleReason(idle.get(product.id)!),
      daysSinceLastSale: idle.get(product.id)!.daysSinceLastSale,
    }));
}

export interface PoolLine {
  productId: string;
  quantity: number;
}

export type { PackCheck } from "@/lib/pricing/capsules";

/**
 * El margen de cada pack sobre la bolsa: los papeles ya impresos y sin anular
 * más los propuestos (al costo de hoy). El piso sale de `resolveCapsuleFloor`:
 * el de la edición, si no el margen mínimo de cápsulas, si no el de la
 * tienda; nunca una cifra del código.
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
  packRungs(options); // Falla antes de consultar la base si falta un pack.

  const [printed, proposedProducts, floor] = await Promise.all([
    prismadb.capsuleSlip.findMany({ where: { editionId, kind: CapsuleSlipKind.SLIP, status: { not: CapsuleSlipStatus.VOID } }, select: { unitCost: true } }),
    proposed.length
      ? prismadb.product.findMany({ where: { storeId, id: { in: proposed.map((line) => line.productId) } }, select: { id: true, acqPrice: true } })
      : Promise.resolve([]),
    resolveCapsuleFloor(storeId, { minMarginPct: edition.minMarginPct }),
  ]);
  const costById = new Map(proposedProducts.map((product) => [product.id, Number(product.acqPrice)]));
  const pool = printed.map((slip) => slip.unitCost);
  for (const line of proposed) {
    const cost = costById.get(line.productId);
    if (cost === undefined || !(cost > 0)) throw ErrorFactory.InvalidRequest("Un producto de la bolsa no existe o no tiene costo");
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw ErrorFactory.InvalidRequest("La cantidad de cada producto debe ser un entero mayor a cero");
    for (let unit = 0; unit < line.quantity; unit += 1) pool.push(cost);
  }

  const minMarginPct = floor?.value ?? null;
  const floorSource = floor?.source ?? null;
  const result = evaluatePoolMargins({ pool, options, minMarginPct, runs });
  return { poolSize: result.poolSize, minMarginPct, floorSource, packs: result.packs, ok: result.ok };
}
