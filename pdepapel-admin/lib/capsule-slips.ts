import {
  CapsuleBatchMode,
  CapsuleCostStatus,
  CapsuleEditionStatus,
  CapsuleSlipKind,
  CapsuleSlipStatus,
  OrderStatus,
  Prisma,
} from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

import { availableStock } from "@/lib/available-stock";
import { ErrorFactory } from "@/lib/api-errors";
import { createInventoryMovement } from "@/lib/inventory";
import { CAPSULE_GIFT_MAX_COST } from "@/lib/pricing/capsules";
import prismadb from "@/lib/prismadb";
import { adjustReservedUnits } from "@/lib/reservation-counters";

/**
 * Papeles y regalos de una edición de cápsulas.
 *
 * Imprimir **aparta** (`reservedUnits`) en el producto real: la tienda, Mercado
 * Libre y el punto de venta dejan de venderlo, y el kardex sigue en el
 * producto verdadero. Solo los papeles (no los regalos) suben el stock del
 * producto de la edición, que es lo que la tienda vende. Sacar un papel para
 * un pedido pagado libera 1, baja 1 de stock en el producto real y congela su
 * costo. Anular libera.
 */

type Tx = Prisma.TransactionClient;

export interface PrintCapsuleSlipsInput {
  storeId: string;
  editionId: string;
  kind: CapsuleSlipKind;
  items: { productId: string; quantity: number }[];
  userId: string;
  notes?: string | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) throw ErrorFactory.InvalidRequest(`${label} debe ser un número entero mayor a cero`);
}

const slipCode = (editionNumber: number) => `CAP-E${editionNumber}-${uuidv4().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

async function lockCapsuleOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT \`id\` FROM \`CapsuleOrder\` WHERE \`orderId\` = ${orderId} FOR UPDATE`;
}

/** El costo del producto de la edición = la media de los papeles que siguen impresos: de ahí sale el costo provisional al pagar. */
export async function refreshEditionUnitCost(tx: Tx, edition: { id: string; productId: string }) {
  const pool = await tx.capsuleSlip.aggregate({
    where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP, status: CapsuleSlipStatus.PRINTED },
    _avg: { unitCost: true },
  });
  const average = pool._avg.unitCost;
  if (average === null) return null;
  await tx.product.update({ where: { id: edition.productId }, data: { acqPrice: round2(average) } });
  return round2(average);
}

export async function printCapsuleSlips({ storeId, editionId, kind, items, userId, notes }: PrintCapsuleSlipsInput) {
  if (items.length === 0) throw ErrorFactory.InvalidRequest("Agrega al menos un producto");
  const seen = new Set<string>();
  for (const item of items) {
    assertPositiveInteger(item.quantity, "La cantidad de cada producto");
    if (seen.has(item.productId)) throw ErrorFactory.InvalidRequest("Un producto aparece dos veces en la lista");
    seen.add(item.productId);
  }

  return prismadb.$transaction(async (tx) => {
    const edition = await tx.capsuleEdition.findFirst({ where: { id: editionId, storeId } });
    if (!edition) throw ErrorFactory.NotFound("Edición no encontrada");
    if (edition.status === CapsuleEditionStatus.CLOSED) throw ErrorFactory.Conflict("La edición está cerrada");
    if (seen.has(edition.productId)) throw ErrorFactory.InvalidRequest("El producto de la edición no puede ser un papel de sí misma");

    const products = await tx.product.findMany({
      where: { id: { in: Array.from(seen) }, storeId },
      select: { id: true, name: true, stock: true, reservedUnits: true, acqPrice: true, isKit: true, isArchived: true, capsuleEdition: { select: { id: true } } },
    });
    if (products.length !== seen.size) throw ErrorFactory.InvalidRequest("Un producto de la lista no existe en esta tienda");
    const byId = new Map(products.map((product) => [product.id, product]));

    // Todo se valida antes de tocar nada: una impresión a medias deja papeles sin apartado.
    for (const item of items) {
      const product = byId.get(item.productId)!;
      if (product.isKit) throw ErrorFactory.InvalidRequest(`«${product.name}» es un kit: imprime papeles de sus piezas, no del kit`);
      if (product.isArchived) throw ErrorFactory.InvalidRequest(`«${product.name}» está archivado`);
      if (product.capsuleEdition) throw ErrorFactory.InvalidRequest(`«${product.name}» es el producto de otra edición`);
      const cost = Number(product.acqPrice || 0);
      if (cost <= 0) throw ErrorFactory.InvalidRequest(`Registra el costo de «${product.name}» antes de imprimir`);
      if (kind === CapsuleSlipKind.SLIP && (cost < edition.costBandMin || cost > edition.costBandMax)) {
        throw ErrorFactory.InvalidRequest(`«${product.name}» está fuera de la banda de costo de la edición`);
      }
      if (kind === CapsuleSlipKind.GIFT && cost > CAPSULE_GIFT_MAX_COST) {
        throw ErrorFactory.InvalidRequest(`«${product.name}» cuesta más de lo que puede costar un regalo`);
      }
      if (availableStock(product) < item.quantity) throw ErrorFactory.InsufficientStock(product.name, availableStock(product), item.quantity);
    }

    const units = items.reduce((total, item) => total + item.quantity, 0);
    const totalCost = round2(items.reduce((total, item) => total + Number(byId.get(item.productId)!.acqPrice) * item.quantity, 0));
    const batch = await tx.capsuleBatch.create({
      data: {
        storeId,
        mode: CapsuleBatchMode.RESERVE,
        editionId,
        capsuleProductId: edition.productId,
        quantity: units,
        unitCost: round2(totalCost / units),
        totalCost,
        notes: notes?.trim() || (kind === CapsuleSlipKind.GIFT ? "Regalos" : null),
        createdBy: userId,
        items: { create: items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitCost: Number(byId.get(item.productId)!.acqPrice) })) },
      },
      select: { id: true },
    });

    const slips = items.flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        storeId,
        editionId,
        batchId: batch.id,
        productId: item.productId,
        kind,
        code: slipCode(edition.number),
        unitCost: Number(byId.get(item.productId)!.acqPrice),
      })),
    );
    await tx.capsuleSlip.createMany({ data: slips });
    await adjustReservedUnits(tx, storeId, new Map(items.map((item) => [item.productId, item.quantity])), "hold");

    if (kind === CapsuleSlipKind.SLIP) {
      await createInventoryMovement(tx, {
        productId: edition.productId,
        storeId,
        type: "CAPSULE_SLIPS_PRINTED",
        quantity: units,
        reason: `${units} papeles impresos de «${edition.name}»`,
        referenceId: batch.id,
        cost: round2(totalCost / units),
        createdBy: userId,
      });
      await refreshEditionUnitCost(tx, edition);
    }

    return { batchId: batch.id, printed: units, codes: slips.map((slip) => slip.code) };
  });
}

/**
 * Anula papeles o regalos que siguen impresos (todos los de la edición si no
 * se dan ids). Un papel solo se puede anular mientras su cápsula no esté
 * vendida: el stock del producto de la edición tiene que alcanzar.
 */
export async function voidCapsuleSlips({ storeId, editionId, slipIds, userId }: { storeId: string; editionId: string; slipIds?: string[]; userId: string }) {
  return prismadb.$transaction(async (tx) => {
    const edition = await tx.capsuleEdition.findFirst({ where: { id: editionId, storeId } });
    if (!edition) throw ErrorFactory.NotFound("Edición no encontrada");
    const slips = await tx.capsuleSlip.findMany({
      where: { editionId, storeId, status: CapsuleSlipStatus.PRINTED, ...(slipIds ? { id: { in: slipIds } } : {}) },
      select: { id: true, productId: true, kind: true },
    });
    if (slipIds && slips.length !== slipIds.length) throw ErrorFactory.Conflict("Algún papel ya no está impreso (se sacó o se anuló)");
    if (slips.length === 0) return { voided: 0 };

    const paperCount = slips.filter((slip) => slip.kind === CapsuleSlipKind.SLIP).length;
    if (paperCount > 0) {
      const product = await tx.product.findUniqueOrThrow({ where: { id: edition.productId }, select: { stock: true, reservedUnits: true } });
      if (availableStock(product) < paperCount) {
        throw ErrorFactory.Conflict(`Solo ${availableStock(product)} papeles están sin vender; los demás esperan a que se saquen para su pedido`);
      }
    }

    const updated = await tx.capsuleSlip.updateMany({
      where: { id: { in: slips.map((slip) => slip.id) }, status: CapsuleSlipStatus.PRINTED },
      data: { status: CapsuleSlipStatus.VOID, voidedAt: new Date() },
    });
    if (updated.count !== slips.length) throw ErrorFactory.Conflict("Los papeles cambiaron mientras anulabas. Intenta de nuevo.");

    const pieces = new Map<string, number>();
    for (const slip of slips) pieces.set(slip.productId, (pieces.get(slip.productId) ?? 0) + 1);
    await adjustReservedUnits(tx, storeId, pieces, "free");

    if (paperCount > 0) {
      await createInventoryMovement(tx, {
        productId: edition.productId,
        storeId,
        type: "CAPSULE_SLIPS_VOIDED",
        quantity: -paperCount,
        reason: `${paperCount} papeles anulados de «${edition.name}»`,
        referenceId: edition.id,
        createdBy: userId,
      });
      await refreshEditionUnitCost(tx, edition);
    }
    return { voided: slips.length };
  });
}

/** Saca un papel o un regalo (por su código) para un pedido de cápsulas pagado. */
export async function drawCapsuleSlip({ storeId, orderId, code, userId }: { storeId: string; orderId: string; code: string; userId: string }) {
  return prismadb.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, storeId }, select: { id: true, status: true, orderNumber: true } });
    if (!order) throw ErrorFactory.NotFound("Pedido no encontrado");
    if (order.status !== OrderStatus.PAID) throw ErrorFactory.Conflict("Solo se sacan papeles de un pedido pagado y sin enviar");
    await lockCapsuleOrder(tx, orderId);
    const capsuleOrder = await tx.capsuleOrder.findUnique({ where: { orderId } });
    if (!capsuleOrder || capsuleOrder.storeId !== storeId) throw ErrorFactory.InvalidRequest("Este pedido no es de cápsulas");
    if (capsuleOrder.drawCompletedAt) throw ErrorFactory.Conflict("Este pedido ya terminó de sacar sus papeles");

    const slip = await tx.capsuleSlip.findFirst({ where: { code: code.trim().toUpperCase(), storeId } });
    if (!slip) throw ErrorFactory.NotFound("Ese código no es un papel de esta tienda");
    if (slip.editionId !== capsuleOrder.editionId) throw ErrorFactory.InvalidRequest("Ese papel es de otra edición");
    if (slip.status !== CapsuleSlipStatus.PRINTED) throw ErrorFactory.Conflict(slip.status === CapsuleSlipStatus.DRAWN ? "Ese papel ya se sacó" : "Ese papel está anulado");

    const drawn = await tx.capsuleSlip.findMany({ where: { orderId, status: CapsuleSlipStatus.DRAWN }, select: { kind: true, unitCost: true } });
    const drawnSlips = drawn.filter((row) => row.kind === CapsuleSlipKind.SLIP);
    const drawnGifts = drawn.filter((row) => row.kind === CapsuleSlipKind.GIFT);
    if (slip.kind === CapsuleSlipKind.SLIP && drawnSlips.length >= capsuleOrder.packSize) {
      throw ErrorFactory.Conflict(`Este pedido ya tiene sus ${capsuleOrder.packSize} papeles`);
    }
    if (slip.kind === CapsuleSlipKind.GIFT) {
      if (drawnGifts.length >= capsuleOrder.giftMaxItems) throw ErrorFactory.Conflict("Este pack no lleva más regalos");
      const giftCost = drawnGifts.reduce((total, row) => total + row.unitCost, 0) + slip.unitCost;
      if (giftCost > capsuleOrder.giftMaxCost + 0.005) throw ErrorFactory.Conflict("Ese regalo pasa el tope de costo del pack");
    }

    const claimed = await tx.capsuleSlip.updateMany({
      where: { id: slip.id, status: CapsuleSlipStatus.PRINTED },
      data: { status: CapsuleSlipStatus.DRAWN, orderId, drawnAt: new Date(), drawnBy: userId },
    });
    if (claimed.count !== 1) throw ErrorFactory.Conflict("Ese papel ya se sacó");

    await adjustReservedUnits(tx, storeId, new Map([[slip.productId, 1]]), "free");
    await createInventoryMovement(tx, {
      productId: slip.productId,
      storeId,
      type: "CAPSULE_SLIP_DRAWN",
      quantity: -1,
      reason: `${slip.kind === CapsuleSlipKind.GIFT ? "Regalo" : "Papel"} ${slip.code} del pedido ${order.orderNumber}`,
      referenceId: orderId,
      cost: slip.unitCost,
      createdBy: userId,
    });
    if (slip.kind === CapsuleSlipKind.SLIP) {
      const edition = await tx.capsuleEdition.findUniqueOrThrow({ where: { id: slip.editionId }, select: { id: true, productId: true } });
      await refreshEditionUnitCost(tx, edition);
    }

    return {
      slipId: slip.id,
      productId: slip.productId,
      kind: slip.kind,
      drawnSlips: drawnSlips.length + (slip.kind === CapsuleSlipKind.SLIP ? 1 : 0),
      drawnGifts: drawnGifts.length + (slip.kind === CapsuleSlipKind.GIFT ? 1 : 0),
    };
  });
}

/**
 * Cierra el sorteo de un pedido: el costo provisional (congelado al pagar) se
 * reemplaza por el real de lo que salió y las finanzas del pedido se mueven en
 * la diferencia. Una sola vez: un segundo cierre no cambia nada.
 */
export async function finishCapsuleDraw({ storeId, orderId }: { storeId: string; orderId: string }) {
  return prismadb.$transaction(async (tx) => {
    await lockCapsuleOrder(tx, orderId);
    const capsuleOrder = await tx.capsuleOrder.findUnique({ where: { orderId } });
    if (!capsuleOrder || capsuleOrder.storeId !== storeId) throw ErrorFactory.InvalidRequest("Este pedido no es de cápsulas");
    if (capsuleOrder.costStatus === CapsuleCostStatus.REAL) throw ErrorFactory.Conflict("El costo real de este pedido ya se registró");
    if (capsuleOrder.provisionalCost === null) throw ErrorFactory.Conflict("El pedido no tiene costo provisional: ¿ya está pagado?");

    const drawn = await tx.capsuleSlip.findMany({ where: { orderId, status: CapsuleSlipStatus.DRAWN }, select: { kind: true, unitCost: true } });
    const slips = drawn.filter((row) => row.kind === CapsuleSlipKind.SLIP).length;
    const gifts = drawn.filter((row) => row.kind === CapsuleSlipKind.GIFT).length;
    if (slips !== capsuleOrder.packSize) throw ErrorFactory.Conflict(`Faltan papeles: van ${slips} de ${capsuleOrder.packSize}`);
    if (capsuleOrder.giftMaxItems > 0 && gifts === 0) throw ErrorFactory.Conflict("Falta el regalo del pack");

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { total: true, totalProductCost: true, netProfit: true } });
    const provisional = capsuleOrder.provisionalCost;
    // El costo del pedido debe traer el provisional completo; si no, la diferencia daría números inventados.
    if (order.totalProductCost === null || order.netProfit === null || order.totalProductCost + 0.005 < provisional) {
      throw ErrorFactory.Conflict("Las finanzas del pedido no traen el costo provisional de las cápsulas; revísalas antes de cerrar");
    }

    const realCost = round2(drawn.reduce((total, row) => total + row.unitCost, 0));
    const delta = round2(realCost - provisional);
    const closed = await tx.capsuleOrder.updateMany({
      where: { id: capsuleOrder.id, costStatus: CapsuleCostStatus.PROVISIONAL },
      data: { realCost, costStatus: CapsuleCostStatus.REAL, drawCompletedAt: new Date() },
    });
    if (closed.count !== 1) throw ErrorFactory.Conflict("El costo real de este pedido ya se registró");

    const netProfit = round2(order.netProfit - delta);
    await tx.order.update({
      where: { id: orderId },
      data: {
        totalProductCost: round2(order.totalProductCost + delta),
        netProfit,
        profitMarginPct: order.total > 0 ? (netProfit / order.total) * 100 : 0,
      },
    });
    return { provisionalCost: provisional, realCost, delta };
  });
}
