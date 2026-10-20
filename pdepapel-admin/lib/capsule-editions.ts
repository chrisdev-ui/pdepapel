import { CapsuleEditionStatus, CapsuleSlipKind, CapsuleSlipStatus, OrderStatus, Prisma } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import { ErrorFactory } from "@/lib/api-errors";
import { voidCapsuleSlips } from "@/lib/capsule-slips";
import { CAPSULE_PACK_PRICES, capsuleSalesEnabled, capsuleUnitPrice } from "@/lib/pricing/capsules";
import prismadb from "@/lib/prismadb";

/**
 * Ediciones de cápsulas: crear (enlazando un producto que Paula ya armó en la
 * ficha), listar, ver y cambiar de estado. La venta (LIVE) se abre en P4 con
 * la bandera de lanzamiento; aquí solo DRAFT ↔ PREVIEW y CLOSED.
 */

type Db = Prisma.TransactionClient | typeof prismadb;

export interface CreateCapsuleEditionInput {
  storeId: string;
  productId: string;
  name: string;
  theme: string;
  costBandMin: number;
  costBandMax: number;
  dailyOrderCap?: number;
  minMarginPct?: unknown;
  userId: string;
}

const text = (value: unknown, max: number, label: string) => {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) throw ErrorFactory.InvalidRequest(`Escribe ${label}`);
  if (clean.length > max) throw ErrorFactory.InvalidRequest(`${label[0].toUpperCase()}${label.slice(1)} es muy largo`);
  return clean;
};

function assertBand(min: number, max: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= min) {
    throw ErrorFactory.InvalidRequest("La banda de costo necesita un mínimo mayor a 0 y un máximo mayor que el mínimo");
  }
}

function parseMinMargin(value: unknown): number | null {
  if (value === null || value === "") return null;
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) throw ErrorFactory.InvalidRequest("El margen mínimo de la edición va de 1 a 99 %");
  return Math.round(pct * 10) / 10;
}

function assertDailyCap(cap: number) {
  if (!Number.isInteger(cap) || cap < 1 || cap > 100) throw ErrorFactory.InvalidRequest("El tope diario va de 1 a 100 pedidos");
}

/**
 * Un producto de edición queda archivado siempre (fuera del catálogo, los
 * feeds, Mercado Libre, el punto de venta y el bot): incluso a la venta, se
 * compra solo desde la página de la edición y el checkout lo admite por ser de
 * una edición LIVE. Restaurarlo desde la ficha o en lote lo vendería por fuera
 * del flujo de cápsulas.
 */
export async function assertEditionProductsStayArchived(db: Db, productIds: readonly string[]) {
  if (productIds.length === 0) return;
  const editions = await db.capsuleEdition.findMany({
    where: { productId: { in: [...productIds] } },
    select: { product: { select: { name: true } } },
  });
  if (editions.length > 0) {
    throw ErrorFactory.Conflict(`«${editions[0].product.name}» es el producto de una edición de cápsulas: sale a la venta desde la edición, no desde la ficha`);
  }
}

export async function createCapsuleEdition(input: CreateCapsuleEditionInput) {
  const name = text(input.name, 120, "el nombre de la edición");
  const theme = text(input.theme, 60, "el tema");
  const costBandMin = Number(input.costBandMin);
  const costBandMax = Number(input.costBandMax);
  assertBand(costBandMin, costBandMax);
  const dailyOrderCap = input.dailyOrderCap === undefined ? undefined : Number(input.dailyOrderCap);
  if (dailyOrderCap !== undefined) assertDailyCap(dailyOrderCap);

  return prismadb.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, storeId: input.storeId },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        reservedUnits: true,
        isKit: true,
        productGroupId: true,
        capsuleEdition: { select: { id: true } },
        marketplaceListings: { select: { id: true }, take: 1 },
      },
    });
    if (!product) throw ErrorFactory.NotFound("Producto no encontrado");
    if (product.capsuleEdition) throw ErrorFactory.Conflict("Ese producto ya es el de otra edición");
    if (product.isKit) throw ErrorFactory.InvalidRequest("Un kit no puede ser el producto de una edición");
    if (product.productGroupId) throw ErrorFactory.InvalidRequest("El producto de una edición no puede ser variante de un grupo");
    if (product.stock !== 0 || product.reservedUnits !== 0) {
      throw ErrorFactory.InvalidRequest("El producto de la edición tiene que empezar sin stock: su stock lo suben los papeles impresos");
    }
    if (product.marketplaceListings.length > 0) throw ErrorFactory.InvalidRequest("Ese producto está en Mercado Libre: las cápsulas no se publican allá");
    const unitPrice = capsuleUnitPrice(CAPSULE_PACK_PRICES[0]);
    if (Number(product.price) !== unitPrice) {
      throw ErrorFactory.InvalidRequest(`El precio del producto tiene que ser el de una cápsula del pack de ${CAPSULE_PACK_PRICES[0].packSize}; cámbialo en su ficha antes de enlazarlo`);
    }

    // El número sigue al más alto de la tienda, no al conteo: una edición borrada no se repite.
    const last = await tx.capsuleEdition.aggregate({ where: { storeId: input.storeId }, _max: { number: true } });
    const edition = await tx.capsuleEdition.create({
      data: {
        storeId: input.storeId,
        number: (last._max.number ?? 0) + 1,
        name,
        theme,
        productId: product.id,
        costBandMin,
        costBandMax,
        ...(dailyOrderCap !== undefined ? { dailyOrderCap } : {}),
        ...(input.minMarginPct !== undefined ? { minMarginPct: parseMinMargin(input.minMarginPct) } : {}),
        createdBy: input.userId,
      },
    });
    await tx.product.update({ where: { id: product.id }, data: { isArchived: true } });
    return edition;
  });
}

const SLIP_COUNT_STATUSES = [CapsuleSlipStatus.PRINTED, CapsuleSlipStatus.DRAWN, CapsuleSlipStatus.VOID] as const;

/** Las ediciones de la tienda con sus cuentas de papeles y regalos. */
export async function listCapsuleEditions(storeId: string) {
  const editions = await prismadb.capsuleEdition.findMany({
    where: { storeId },
    orderBy: { number: "desc" },
    include: { product: { select: { id: true, name: true, stock: true, reservedUnits: true } } },
  });
  const counts = await prismadb.capsuleSlip.groupBy({
    by: ["editionId", "kind", "status"],
    where: { storeId, editionId: { in: editions.map((edition) => edition.id) } },
    _count: { _all: true },
  });
  const count = (editionId: string, kind: CapsuleSlipKind, status: CapsuleSlipStatus) =>
    counts.find((row) => row.editionId === editionId && row.kind === kind && row.status === status)?._count._all ?? 0;
  return editions.map((edition) => ({
    id: edition.id,
    number: edition.number,
    name: edition.name,
    theme: edition.theme,
    status: edition.status,
    product: { id: edition.product.id, name: edition.product.name },
    /** Cápsulas sin vender: el stock disponible del producto de la edición. */
    unsold: availableStock(edition.product),
    slips: Object.fromEntries(SLIP_COUNT_STATUSES.map((status) => [status, count(edition.id, CapsuleSlipKind.SLIP, status)])),
    gifts: Object.fromEntries(SLIP_COUNT_STATUSES.map((status) => [status, count(edition.id, CapsuleSlipKind.GIFT, status)])),
  }));
}

/** Una edición con su configuración de packs y su bolsa agrupada por producto. */
export async function getCapsuleEdition(storeId: string, editionId: string) {
  const edition = await prismadb.capsuleEdition.findFirst({
    where: { id: editionId, storeId },
    include: {
      product: { select: { id: true, name: true, price: true, stock: true, reservedUnits: true, isArchived: true } },
      packOptions: { orderBy: { packSize: "asc" } },
    },
  });
  if (!edition) throw ErrorFactory.NotFound("Edición no encontrada");
  const slips = await prismadb.capsuleSlip.findMany({
    where: { editionId, storeId },
    select: { id: true, code: true, kind: true, status: true, unitCost: true, productId: true, orderId: true, product: { select: { name: true, sku: true } } },
    orderBy: [{ createdAt: "asc" }, { code: "asc" }],
  });
  const pool = new Map<string, { productId: string; name: string; sku: string; kind: CapsuleSlipKind; unitCost: number; printed: number; drawn: number; voided: number }>();
  for (const slip of slips) {
    const key = `${slip.kind}:${slip.productId}`;
    const row = pool.get(key) ?? { productId: slip.productId, name: slip.product.name, sku: slip.product.sku, kind: slip.kind, unitCost: slip.unitCost, printed: 0, drawn: 0, voided: 0 };
    if (slip.status === CapsuleSlipStatus.PRINTED) row.printed += 1;
    if (slip.status === CapsuleSlipStatus.DRAWN) row.drawn += 1;
    if (slip.status === CapsuleSlipStatus.VOID) row.voided += 1;
    pool.set(key, row);
  }
  return {
    edition: { ...edition, unsold: availableStock(edition.product) },
    pool: Array.from(pool.values()).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
    printedSlips: slips
      .filter((slip) => slip.status === CapsuleSlipStatus.PRINTED)
      .map((slip) => ({ id: slip.id, code: slip.code, kind: slip.kind, productId: slip.productId, productName: slip.product.name, sku: slip.product.sku })),
  };
}

const NEXT_STATUSES: Record<CapsuleEditionStatus, CapsuleEditionStatus[]> = {
  DRAFT: [CapsuleEditionStatus.PREVIEW, CapsuleEditionStatus.CLOSED],
  PREVIEW: [CapsuleEditionStatus.DRAFT, CapsuleEditionStatus.LIVE, CapsuleEditionStatus.CLOSED],
  LIVE: [CapsuleEditionStatus.PREVIEW, CapsuleEditionStatus.CLOSED],
  CLOSED: [],
};

export interface UpdateCapsuleEditionInput {
  storeId: string;
  editionId: string;
  userId: string;
  name?: unknown;
  theme?: unknown;
  costBandMin?: unknown;
  costBandMax?: unknown;
  dailyOrderCap?: unknown;
  minMarginPct?: unknown;
  status?: unknown;
}

export async function updateCapsuleEdition(input: UpdateCapsuleEditionInput) {
  const edition = await prismadb.capsuleEdition.findFirst({ where: { id: input.editionId, storeId: input.storeId } });
  if (!edition) throw ErrorFactory.NotFound("Edición no encontrada");
  if (edition.status === CapsuleEditionStatus.CLOSED) throw ErrorFactory.Conflict("La edición está cerrada");

  const data: Prisma.CapsuleEditionUpdateInput = {};
  if (input.name !== undefined) data.name = text(input.name, 120, "el nombre de la edición");
  if (input.theme !== undefined) data.theme = text(input.theme, 60, "el tema");
  if (input.dailyOrderCap !== undefined) {
    const cap = Number(input.dailyOrderCap);
    assertDailyCap(cap);
    data.dailyOrderCap = cap;
  }
  if (input.minMarginPct !== undefined) data.minMarginPct = parseMinMargin(input.minMarginPct);
  if (input.costBandMin !== undefined || input.costBandMax !== undefined) {
    const min = input.costBandMin === undefined ? edition.costBandMin : Number(input.costBandMin);
    const max = input.costBandMax === undefined ? edition.costBandMax : Number(input.costBandMax);
    assertBand(min, max);
    const printed = await prismadb.capsuleSlip.count({ where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP, status: { not: CapsuleSlipStatus.VOID } } });
    if (printed > 0) throw ErrorFactory.Conflict("La banda no cambia después de imprimir papeles: todos los papeles de una edición son equivalentes");
    data.costBandMin = min;
    data.costBandMax = max;
  }

  const target = input.status === undefined ? null : (input.status as CapsuleEditionStatus);
  if (target !== null && target !== edition.status) {
    if (!(Object.values(CapsuleEditionStatus) as string[]).includes(target)) throw ErrorFactory.InvalidRequest("Estado de edición inválido");
    if (!NEXT_STATUSES[edition.status].includes(target)) throw ErrorFactory.Conflict("Ese cambio de estado no está permitido");
    if (target === CapsuleEditionStatus.CLOSED) return closeCapsuleEdition(edition.id, input.storeId, input.userId, data);
    if (target === CapsuleEditionStatus.LIVE) return openCapsuleEdition(edition.id, input.storeId, data);
    data.status = target;
  }

  return prismadb.capsuleEdition.update({ where: { id: edition.id }, data });
}

/**
 * A la venta: con la bandera de lanzamiento, con packs configurados y una sola
 * edición LIVE por tienda (los cupos del día son de la tienda, la capacidad de
 * Paula). La fila de la tienda se bloquea para que dos ediciones no se abran a
 * la vez.
 */
async function openCapsuleEdition(editionId: string, storeId: string, data: Prisma.CapsuleEditionUpdateInput) {
  if (!capsuleSalesEnabled()) {
    throw ErrorFactory.Conflict("La venta de una edición se abre con la bandera de lanzamiento, después de la revisión legal");
  }
  return prismadb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Store WHERE id = ${storeId} FOR UPDATE`;
    const live = await tx.capsuleEdition.findFirst({ where: { storeId, status: CapsuleEditionStatus.LIVE, id: { not: editionId } }, select: { number: true, name: true } });
    if (live) throw ErrorFactory.Conflict(`La edición #${live.number} ${live.name} ya está a la venta: pásala a vista previa o ciérrala antes de abrir otra`);
    const packs = await tx.capsulePackOption.count({ where: { editionId } });
    if (packs === 0) throw ErrorFactory.Conflict("Configura y guarda los packs antes de abrir la venta");
    return tx.capsuleEdition.update({ where: { id: editionId }, data: { ...data, status: CapsuleEditionStatus.LIVE } });
  });
}

/**
 * Cerrar anula los papeles y regalos que siguen impresos. No se cierra con
 * pedidos pagados sin terminar de sacar: sus papeles y su regalo saldrían de
 * esta bolsa.
 */
async function closeCapsuleEdition(editionId: string, storeId: string, userId: string, data: Prisma.CapsuleEditionUpdateInput) {
  const pending = await prismadb.capsuleOrder.count({
    where: { editionId, drawCompletedAt: null, order: { status: { in: [OrderStatus.PAID, OrderStatus.PENDING] } } },
  });
  if (pending > 0) throw ErrorFactory.Conflict(`Hay ${pending === 1 ? "1 pedido" : `${pending} pedidos`} de esta edición sin terminar de sacar sus papeles`);
  await voidCapsuleSlips({ storeId, editionId, userId });
  return prismadb.capsuleEdition.update({ where: { id: editionId }, data: { ...data, status: CapsuleEditionStatus.CLOSED, closedAt: new Date() } });
}
