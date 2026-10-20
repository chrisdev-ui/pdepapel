import { CapsuleSlipKind, CapsuleSlipStatus, OrderStatus, PaymentMethod, Prisma } from "@prisma/client";

/**
 * Lo que la clienta ve de su pack de cápsulas: en el recibo (`/pedido/[id]`) y
 * en el correo del pedido. Nunca costos, códigos de papel ni ids; los
 * productos que salieron solo después de cerrar el sorteo. Sin cifras en pesos
 * de lo que «vale» el contenido.
 */
export interface CapsuleReceipt {
  editionName: string;
  editionNumber: number;
  packSize: number;
  giftLabel: string | null;
  drawCompleted: boolean;
  /** Lo que salió (papeles y regalo), solo con el sorteo cerrado. */
  products: { name: string; gift: boolean }[];
}

type ReceiptDb = Pick<Prisma.TransactionClient, "capsuleOrder" | "capsuleSlip">;

/** Solo consulta si el pedido trae un producto archivado, como lo es el de una edición. */
export async function loadCapsuleReceipt(db: ReceiptDb, order: { id: string; orderItems: { product?: { isArchived?: boolean } | null }[] }): Promise<CapsuleReceipt | null> {
  if (!order.orderItems.some((item) => item.product?.isArchived)) return null;
  const capsuleOrder = await db.capsuleOrder.findUnique({
    where: { orderId: order.id },
    select: { packSize: true, drawCompletedAt: true, edition: { select: { name: true, number: true, packOptions: { select: { packSize: true, giftLabel: true } } } } },
  });
  if (!capsuleOrder) return null;
  const drawCompleted = capsuleOrder.drawCompletedAt !== null;
  const slips = drawCompleted
    ? await db.capsuleSlip.findMany({ where: { orderId: order.id, status: CapsuleSlipStatus.DRAWN }, select: { kind: true, product: { select: { name: true } } }, orderBy: [{ kind: "desc" }, { code: "asc" }] })
    : [];
  return {
    editionName: capsuleOrder.edition.name,
    editionNumber: capsuleOrder.edition.number,
    packSize: capsuleOrder.packSize,
    giftLabel: capsuleOrder.edition.packOptions.find((option) => option.packSize === capsuleOrder.packSize)?.giftLabel ?? null,
    drawCompleted,
    products: slips.map((slip) => ({ name: slip.product.name, gift: slip.kind === CapsuleSlipKind.GIFT })),
  };
}

/** El párrafo de agradecimiento del correo de un pedido de cápsulas. */
export function capsuleThanksParagraph(capsule: { packSize: number; giftLabel: string | null }, status: OrderStatus, paymentMethod: PaymentMethod | null = null): string {
  const gift = capsule.giftLabel ? ` Tu pack trae ${capsule.giftLabel}.` : "";
  if (status === OrderStatus.PAID) {
    return `¡Gracias por tu pack de ${capsule.packSize} cápsulas sorpresa! Abriremos tus cápsulas, te contamos qué salió y te enviamos tus productos en una cajita.${gift}`;
  }
  if (paymentMethod === PaymentMethod.BankTransfer) {
    // El cupo del día queda apartado 24 horas (CAPSULE_TRANSFER_HOLD_HOURS) mientras se verifica.
    return `Recibimos tu pack de ${capsule.packSize} cápsulas sorpresa y te guardamos el cupo de hoy por 24 horas. Sube el comprobante de tu transferencia desde el enlace de tu pedido; cuando lo verifiquemos, abriremos tus cápsulas y te enviamos tus productos.${gift}`;
  }
  return `Recibimos tu pack de ${capsule.packSize} cápsulas sorpresa. Cuando se confirme el pago, abriremos tus cápsulas y te enviamos tus productos.${gift}`;
}
