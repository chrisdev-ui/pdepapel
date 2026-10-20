import { CapsuleSlipKind, CapsuleSlipStatus, Prisma } from "@prisma/client";

import { scrubCapsulePayload } from "@/lib/viewer-payloads";

/**
 * La sección de cápsulas del pedido en el panel: pack, regalo, permiso del
 * video, estado del sorteo, cupo del día y lo que salió. El costo provisional
 * y el real solo para la dueña; la cuenta de solo lectura lo recibe limpio
 * (`scrubCapsulePayload`). Una consulta acotada al pedido; sin pedido de
 * cápsulas, null.
 */
type SectionDb = Pick<Prisma.TransactionClient, "capsuleOrder" | "capsuleSlip" | "capsuleDailySlot">;

export async function getOrderCapsuleSection(db: SectionDb, { storeId, orderId, isViewer }: { storeId: string; orderId: string; isViewer: boolean }) {
  const capsuleOrder = await db.capsuleOrder.findFirst({
    where: { orderId, storeId },
    select: {
      packSize: true,
      giftMaxItems: true,
      giftMaxCost: true,
      videoConsent: true,
      videoStatus: true,
      suggestedBox: true,
      provisionalCost: true,
      realCost: true,
      costStatus: true,
      drawCompletedAt: true,
      edition: { select: { number: true, name: true, packOptions: { select: { packSize: true, giftLabel: true } } } },
    },
  });
  if (!capsuleOrder) return null;
  const [slips, slot] = await Promise.all([
    db.capsuleSlip.findMany({ where: { orderId, status: CapsuleSlipStatus.DRAWN }, select: { kind: true, product: { select: { name: true } } }, orderBy: [{ kind: "desc" }, { code: "asc" }] }),
    db.capsuleDailySlot.findUnique({ where: { orderId }, select: { bogotaDate: true, slotNumber: true, status: true } }),
  ]);
  const { edition, ...rest } = capsuleOrder;
  const section = {
    ...rest,
    editionNumber: edition.number,
    editionName: edition.name,
    giftLabel: edition.packOptions.find((option) => option.packSize === capsuleOrder.packSize)?.giftLabel ?? null,
    slipsDrawn: slips.filter((slip) => slip.kind === CapsuleSlipKind.SLIP).length,
    giftsDrawn: slips.filter((slip) => slip.kind === CapsuleSlipKind.GIFT).length,
    products: slips.map((slip) => ({ name: slip.product.name, gift: slip.kind === CapsuleSlipKind.GIFT })),
    slot: slot ? { day: slot.bogotaDate.toISOString().slice(0, 10), number: slot.slotNumber, status: slot.status } : null,
  };
  return isViewer ? scrubCapsulePayload(section) : section;
}

export type OrderCapsuleSection = NonNullable<Awaited<ReturnType<typeof getOrderCapsuleSection>>>;
