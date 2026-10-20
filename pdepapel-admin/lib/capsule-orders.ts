import { CapsuleSlipKind, CapsuleSlipStatus, CapsuleVideoConsent, CapsuleVideoStatus, OrderStatus } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { suggestCapsuleBox } from "@/lib/capsule-box";
import { finishCapsuleDraw } from "@/lib/capsule-slips";
import { createGuideInBackground } from "@/lib/guide-background";
import prismadb from "@/lib/prismadb";

/**
 * Los pedidos de cápsulas del lado de Paula: la cola de «sacar» (pagados sin
 * terminar), el detalle de uno (lo que salió y los regalos que le caben),
 * cerrar el sorteo con la caja sugerida y la cola de videos.
 */

const firstName = (fullName: string | null) => (fullName ?? "").trim().split(/\s+/)[0] || "Sin nombre";

const QUEUE_INCLUDE = {
  order: { select: { id: true, orderNumber: true, fullName: true, status: true, paidAt: true } },
  edition: { select: { id: true, number: true, name: true, packOptions: { select: { packSize: true, giftLabel: true } } } },
} as const;

export async function listCapsuleQueue(storeId: string, onlyOrderIds?: string[]) {
  const rows = await prismadb.capsuleOrder.findMany({
    where: { storeId, order: { status: { in: [OrderStatus.PAID, OrderStatus.SENT] } }, ...(onlyOrderIds ? { orderId: { in: onlyOrderIds } } : {}) },
    include: QUEUE_INCLUDE,
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  const drawn = await prismadb.capsuleSlip.groupBy({
    by: ["orderId", "kind"],
    where: { storeId, status: CapsuleSlipStatus.DRAWN, orderId: { in: rows.map((row) => row.orderId) } },
    _count: { _all: true },
  });
  const count = (orderId: string, kind: CapsuleSlipKind) => drawn.find((row) => row.orderId === orderId && row.kind === kind)?._count._all ?? 0;
  return rows.map((row) => ({
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    firstName: firstName(row.order.fullName),
    orderStatus: row.order.status,
    paidAt: row.order.paidAt,
    edition: { id: row.edition.id, number: row.edition.number, name: row.edition.name },
    packSize: row.packSize,
    giftMaxItems: row.giftMaxItems,
    giftLabel: row.edition.packOptions.find((option) => option.packSize === row.packSize)?.giftLabel ?? null,
    slipsDrawn: count(row.orderId, CapsuleSlipKind.SLIP),
    giftsDrawn: count(row.orderId, CapsuleSlipKind.GIFT),
    drawCompletedAt: row.drawCompletedAt,
    provisionalCost: row.provisionalCost,
    realCost: row.realCost,
    costStatus: row.costStatus,
    suggestedBox: row.suggestedBox,
    videoConsent: row.videoConsent,
    videoStatus: row.videoStatus,
    videoUrl: row.videoUrl,
  }));
}

export type CapsuleQueueRow = Awaited<ReturnType<typeof listCapsuleQueue>>[number];

/** Un pedido: lo que ya salió y los regalos de la bolsa que todavía le caben (por costo). */
export async function getCapsuleDraw(storeId: string, orderId: string) {
  const capsuleOrder = await prismadb.capsuleOrder.findUnique({ where: { orderId }, include: QUEUE_INCLUDE });
  if (!capsuleOrder || capsuleOrder.storeId !== storeId) throw ErrorFactory.NotFound("Pedido de cápsulas no encontrado");
  const drawn = await prismadb.capsuleSlip.findMany({
    where: { orderId, status: CapsuleSlipStatus.DRAWN },
    select: { id: true, code: true, kind: true, unitCost: true, drawnAt: true, product: { select: { name: true } } },
    orderBy: { drawnAt: "asc" },
  });
  const giftSpent = drawn.filter((slip) => slip.kind === CapsuleSlipKind.GIFT).reduce((total, slip) => total + slip.unitCost, 0);
  const giftsLeft = capsuleOrder.giftMaxItems - drawn.filter((slip) => slip.kind === CapsuleSlipKind.GIFT).length;
  const giftRoom = capsuleOrder.giftMaxCost - giftSpent;
  const giftSlips =
    giftsLeft > 0 && !capsuleOrder.drawCompletedAt
      ? await prismadb.capsuleSlip.findMany({
          where: { editionId: capsuleOrder.editionId, kind: CapsuleSlipKind.GIFT, status: CapsuleSlipStatus.PRINTED, unitCost: { lte: giftRoom + 0.005 } },
          select: { code: true, productId: true, unitCost: true, product: { select: { name: true } } },
          orderBy: [{ unitCost: "desc" }, { code: "asc" }],
        })
      : [];
  // Un regalo por producto (el primer código libre): Paula elige el producto, no el papel.
  const giftOptions = Array.from(new Map(giftSlips.map((slip) => [slip.productId, { code: slip.code, productName: slip.product.name, unitCost: slip.unitCost }])).values());
  const [row] = await listCapsuleQueue(storeId, [capsuleOrder.orderId]);
  if (!row) throw ErrorFactory.Conflict("El pedido de cápsulas no está pagado");
  return {
    ...row,
    giftMaxCost: capsuleOrder.giftMaxCost,
    drawn: drawn.map((slip) => ({ id: slip.id, code: slip.code, kind: slip.kind, productName: slip.product.name, unitCost: slip.unitCost })),
    giftOptions,
  };
}

/** Cierra el sorteo (costo real, finanzas) y deja la caja sugerida según lo que salió. */
export async function completeCapsuleDraw({ storeId, orderId }: { storeId: string; orderId: string }) {
  const result = await finishCapsuleDraw({ storeId, orderId });
  const [slips, boxes] = await Promise.all([
    prismadb.capsuleSlip.findMany({ where: { orderId, status: CapsuleSlipStatus.DRAWN }, select: { product: { select: { size: { select: { value: true } } } } } }),
    prismadb.box.findMany({ where: { storeId }, select: { name: true, type: true, isDefault: true } }),
  ]);
  const box = suggestCapsuleBox(slips.map((slip) => slip.product.size?.value ?? null), boxes);
  await prismadb.capsuleOrder.update({ where: { orderId }, data: { suggestedBox: box.type } });
  // Con el sorteo cerrado el pedido ya puede salir: la guía se compra en segundo
  // plano con la caja sugerida (o queda el motivo en el envío si falla).
  const shipping = await prismadb.shipping.findFirst({ where: { orderId, storeId }, select: { envioClickIdRate: true, envioClickIdOrder: true } });
  const guideQueued = Boolean(shipping?.envioClickIdRate && !shipping.envioClickIdOrder);
  if (guideQueued) createGuideInBackground({ orderId, storeId, source: "sorteo de cápsulas cerrado" });
  return { ...result, box, guideQueued };
}

const VIDEO_FLOW: CapsuleVideoStatus[] = [CapsuleVideoStatus.POR_ABRIR, CapsuleVideoStatus.GRABADO, CapsuleVideoStatus.ENVIADO, CapsuleVideoStatus.PUBLICADO];

/**
 * La cola de videos va hacia adelante: Por abrir → Grabado → Enviado →
 * Publicado. Grabar exige el sorteo cerrado; publicar exige el permiso de
 * la clienta para su primer nombre y el enlace.
 */
export async function updateCapsuleVideo({ storeId, orderId, videoStatus, videoUrl }: { storeId: string; orderId: string; videoStatus?: unknown; videoUrl?: unknown }) {
  const capsuleOrder = await prismadb.capsuleOrder.findUnique({ where: { orderId } });
  if (!capsuleOrder || capsuleOrder.storeId !== storeId) throw ErrorFactory.NotFound("Pedido de cápsulas no encontrado");

  let url = capsuleOrder.videoUrl;
  if (videoUrl !== undefined) {
    const clean = typeof videoUrl === "string" ? videoUrl.trim() : "";
    if (clean && !/^https:\/\/\S+$/.test(clean)) throw ErrorFactory.InvalidRequest("El enlace del video tiene que empezar por https://");
    if (clean.length > 500) throw ErrorFactory.InvalidRequest("El enlace del video es muy largo");
    url = clean || null;
  }

  let status = capsuleOrder.videoStatus;
  if (videoStatus !== undefined && videoStatus !== capsuleOrder.videoStatus) {
    const target = videoStatus as CapsuleVideoStatus;
    if (!VIDEO_FLOW.includes(target)) throw ErrorFactory.InvalidRequest("Estado de video inválido");
    if (VIDEO_FLOW.indexOf(target) !== VIDEO_FLOW.indexOf(capsuleOrder.videoStatus) + 1) throw ErrorFactory.Conflict("El video avanza un paso a la vez");
    if (target === CapsuleVideoStatus.GRABADO && !capsuleOrder.drawCompletedAt) throw ErrorFactory.Conflict("Primero termina de sacar los papeles del pedido");
    if (target === CapsuleVideoStatus.PUBLICADO) {
      if (capsuleOrder.videoConsent !== CapsuleVideoConsent.PUBLIC_FIRST_NAME) throw ErrorFactory.Conflict("La clienta no dio permiso para publicar su video");
      if (!url) throw ErrorFactory.InvalidRequest("Agrega el enlace de la publicación");
    }
    status = target;
  }

  return prismadb.capsuleOrder.update({ where: { orderId }, data: { videoStatus: status, videoUrl: url } });
}
