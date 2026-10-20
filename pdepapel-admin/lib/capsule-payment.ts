import { CapsuleDailySlotStatus, Prisma } from "@prisma/client";

import { lockCapsuleDay } from "@/lib/capsule-checkout";
import { bogotaDate } from "@/lib/capsule-day";
import { capsuleProvisionalCost } from "@/lib/pricing/capsules";

type PaymentDb = Pick<Prisma.TransactionClient, "$queryRaw" | "capsuleOrder" | "capsuleEdition" | "capsuleDailySlot" | "order">;

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Lo que un pedido de cápsulas hace al pagarse, dentro de la misma transacción
 * que escribe sus finanzas (`calculateOrderFinancials`) en cualquiera de los
 * caminos de pago: Bold, Wompi, «Marcar pagado» (uno o en lote), un pedido del
 * panel que nace pagado y la tarjeta de regalo que lo cubre entero.
 *
 * - Congela el costo provisional: costo del producto de la edición (la media
 *   de los papeles, lo mismo que ya contó la finanza) × pack + el tope del
 *   regalo, y suma ese tope al costo del pedido. Sin esto el cierre del
 *   sorteo nunca pasaría (`finishCapsuleDraw` exige que las finanzas traigan
 *   el provisional completo).
 * - Confirma su cupo del día. Si el apartado venció y otro pedido lo tomó, el
 *   pago gana igual: el cupo se crea confirmado aunque pase del tope.
 *
 * Idempotente: un segundo pago (reintento del webhook) no suma dos veces. No
 * lanza por datos de la edición: un pago nunca se rechaza por esto.
 */
export async function applyCapsulePayment(db: PaymentDb, { orderId, storeId }: { orderId: string; storeId: string }) {
  const capsuleOrder = await db.capsuleOrder.findUnique({
    where: { orderId },
    select: { id: true, editionId: true, packSize: true, giftMaxCost: true, provisionalCost: true },
  });
  if (!capsuleOrder) return;

  if (capsuleOrder.provisionalCost === null) {
    const edition = await db.capsuleEdition.findUnique({ where: { id: capsuleOrder.editionId }, select: { product: { select: { acqPrice: true } } } });
    const averageSlipCost = Number(edition?.product.acqPrice) || 0;
    if (averageSlipCost > 0) {
      const provisionalCost = capsuleProvisionalCost({ averageSlipCost, packSize: capsuleOrder.packSize, giftMaxCost: capsuleOrder.giftMaxCost });
      const frozen = await db.capsuleOrder.updateMany({ where: { id: capsuleOrder.id, provisionalCost: null }, data: { provisionalCost } });
      if (frozen.count === 1 && capsuleOrder.giftMaxCost > 0) {
        const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { total: true, totalProductCost: true, netProfit: true } });
        if (order.totalProductCost !== null && order.netProfit !== null) {
          const netProfit = round2(order.netProfit - capsuleOrder.giftMaxCost);
          await db.order.update({
            where: { id: orderId },
            data: {
              totalProductCost: round2(order.totalProductCost + capsuleOrder.giftMaxCost),
              netProfit,
              profitMarginPct: order.total > 0 ? (netProfit / order.total) * 100 : 0,
            },
          });
        }
      }
    } else {
      console.error(`[CAPSULE_PAYMENT] La edición del pedido ${orderId} no tiene costo de papeles: el costo provisional queda pendiente`);
    }
  }

  const slot = await db.capsuleDailySlot.findUnique({ where: { orderId }, select: { status: true } });
  if (slot?.status === CapsuleDailySlotStatus.CONFIRMED) return;
  if (slot) {
    await db.capsuleDailySlot.update({ where: { orderId }, data: { status: CapsuleDailySlotStatus.CONFIRMED, expiresAt: null } });
    return;
  }
  // El apartado venció y se liberó: el pago gana, en su día, aunque pase del tope.
  await lockCapsuleDay(db, storeId);
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { createdAt: true } });
  const day = bogotaDate(order.createdAt);
  // Los muertos conservan su número hasta que se borran: se cuentan como tomados.
  const taken = await db.capsuleDailySlot.findMany({ where: { storeId, bogotaDate: day }, select: { slotNumber: true } });
  const used = new Set(taken.map((row) => row.slotNumber));
  let slotNumber = 1;
  while (used.has(slotNumber)) slotNumber += 1;
  await db.capsuleDailySlot.create({ data: { storeId, bogotaDate: day, slotNumber, orderId, status: CapsuleDailySlotStatus.CONFIRMED } });
}
