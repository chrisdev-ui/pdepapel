import { CapsuleDailySlotStatus, CapsuleEditionStatus, CapsuleVideoConsent, PaymentMethod, Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { availableStock } from "@/lib/available-stock";
import { bogotaDate, bogotaMinutes, daySlots, formatOpensAt, minutesOf } from "@/lib/capsule-day";
import { CAPSULE_MIN_PACK, CAPSULE_PACK_PRICES, capsuleSalesEnabled, capsuleUnitPrice, maxPackFor } from "@/lib/pricing/capsules";

/**
 * Un pedido de cápsulas, del lado del servidor: lo que se valida antes de abrir
 * la transacción (`resolveCapsuleOrder`) y lo que se escribe dentro de ella
 * (`reserveCapsuleOrder`: el `CapsuleOrder` y el cupo del día).
 *
 * Reglas del MVP: el pack va solo en su pedido; sin cupones ni descuentos; el
 * precio es el del peldaño (nunca una oferta); la edición debe estar a la venta
 * con la bandera; desde la tienda se paga en línea (Bold o Wompi), porque el
 * sorteo exige el pedido pagado y la guía exige el sorteo cerrado.
 */

export type CapsuleChannel = "STORE" | "PANEL";

/** Ventana de pago: lo que dura apartado un cupo del día sin pagar. */
export const CAPSULE_HOLD_MINUTES = 120;

export interface CapsuleOrderPlan {
  editionId: string;
  editionProductId: string;
  packSize: number;
  unitPrice: number;
  giftMaxCost: number;
  giftMaxItems: number;
  videoConsent: CapsuleVideoConsent;
  dailyOrderCap: number;
  opensAtLocal: string;
  channel: CapsuleChannel;
}

type EditionLookupDb = Pick<Prisma.TransactionClient, "capsuleEdition">;

const STORE_PAYMENT_METHODS: ReadonlySet<string> = new Set([PaymentMethod.Bold, PaymentMethod.Wompi]);

function parseConsent(value: unknown): CapsuleVideoConsent {
  return typeof value === "string" && (Object.values(CapsuleVideoConsent) as string[]).includes(value) ? (value as CapsuleVideoConsent) : CapsuleVideoConsent.NONE;
}

export async function resolveCapsuleOrder(
  db: EditionLookupDb,
  input: {
    storeId: string;
    items: readonly { productId?: string | null; quantity?: number }[];
    paymentMethod?: string | null;
    hasCoupon: boolean;
    hasDiscount: boolean;
    channel: CapsuleChannel;
    videoConsent?: unknown;
    /**
     * Los productos del carrito que están archivados, si ya se cargaron. Un
     * producto de edición siempre está archivado: sin ninguno, no se consulta
     * nada (el checkout normal no paga una consulta de más).
     */
    archivedProductIds?: readonly string[];
  },
): Promise<CapsuleOrderPlan | null> {
  const productIds = input.archivedProductIds
    ? Array.from(new Set(input.archivedProductIds))
    : Array.from(new Set(input.items.map((item) => item.productId).filter((id): id is string => Boolean(id))));
  if (productIds.length === 0) return null;
  const editions = await db.capsuleEdition.findMany({
    where: { storeId: input.storeId, productId: { in: productIds } },
    select: {
      id: true,
      productId: true,
      status: true,
      dailyOrderCap: true,
      opensAtLocal: true,
      packOptions: { select: { packSize: true, giftMaxCost: true, giftMaxItems: true } },
      product: { select: { stock: true, reservedUnits: true } },
    },
  });
  if (editions.length === 0) return null;

  if (editions.length > 1 || input.items.length !== 1) {
    throw ErrorFactory.Conflict("Un pack de cápsulas va solo en su pedido: compra los demás productos en otro pedido");
  }
  const [edition] = editions;
  if (!capsuleSalesEnabled()) throw ErrorFactory.Conflict("La venta de cápsulas todavía no está abierta");
  if (edition.status !== CapsuleEditionStatus.LIVE) throw ErrorFactory.Conflict("Esta edición de cápsulas no está a la venta");

  if (input.paymentMethod === PaymentMethod.COD) {
    throw ErrorFactory.InvalidRequest("Los packs de cápsulas se pagan antes de abrirlos: no hay pago contra entrega");
  }
  if (input.channel === "STORE" && !STORE_PAYMENT_METHODS.has(String(input.paymentMethod))) {
    throw ErrorFactory.InvalidRequest("Los packs de cápsulas se pagan en línea");
  }
  if (input.hasCoupon || input.hasDiscount) {
    throw ErrorFactory.Conflict("Los cupones y descuentos no aplican a los packs de cápsulas");
  }

  const packSize = Number(input.items[0].quantity ?? 1);
  const rung = CAPSULE_PACK_PRICES.find((price) => price.packSize === packSize);
  const option = edition.packOptions.find((row) => row.packSize === packSize);
  if (!rung || !option || packSize < CAPSULE_MIN_PACK) {
    const sizes = CAPSULE_PACK_PRICES.filter((price) => edition.packOptions.some((row) => row.packSize === price.packSize)).map((price) => price.packSize);
    throw ErrorFactory.InvalidRequest(`Elige un pack de ${sizes.join(", ")} cápsulas`);
  }
  const largest = maxPackFor(availableStock(edition.product));
  if (largest === null || packSize > largest) {
    throw ErrorFactory.Conflict(
      largest === null ? "Esta edición se quedó sin cápsulas" : `Quedan pocas cápsulas en la edición: el pack más grande disponible es de ${largest}`,
    );
  }

  return {
    editionId: edition.id,
    editionProductId: edition.productId,
    packSize,
    unitPrice: capsuleUnitPrice(rung),
    giftMaxCost: option.giftMaxCost,
    giftMaxItems: option.giftMaxItems,
    videoConsent: parseConsent(input.videoConsent),
    dailyOrderCap: edition.dailyOrderCap,
    opensAtLocal: edition.opensAtLocal,
    channel: input.channel,
  };
}

type ReserveDb = Pick<Prisma.TransactionClient, "$queryRaw" | "capsuleOrder" | "capsuleDailySlot" | "capsuleDayCap" | "order">;

/**
 * Bloquea la fila de la tienda: todos los cupos de cápsulas del día se asignan
 * en fila. Es una fila por tienda y unos pocos pedidos al día, así que no hay
 * espera real; el índice único (tienda, día, número) es la última defensa.
 */
export async function lockCapsuleDay(db: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string) {
  await db.$queryRaw`SELECT id FROM Store WHERE id = ${storeId} FOR UPDATE`;
}

const firstFree = (taken: readonly number[]) => {
  const used = new Set(taken);
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return slot;
};

/**
 * Dentro de la transacción que crea el pedido: el `CapsuleOrder` (pack y regalo
 * copiados del peldaño, el permiso del video) y un cupo del día apartado
 * (`HELD`) por la ventana de pago. Los cupos muertos del día (apartado
 * vencido, pedido cancelado o borrado) se borran antes de contar.
 */
export async function reserveCapsuleOrder(db: ReserveDb, plan: CapsuleOrderPlan, { storeId, orderId, now = new Date() }: { storeId: string; orderId: string; now?: Date }) {
  await db.capsuleOrder.create({
    data: {
      storeId,
      orderId,
      editionId: plan.editionId,
      packSize: plan.packSize,
      giftMaxCost: plan.giftMaxCost,
      giftMaxItems: plan.giftMaxItems,
      videoConsent: plan.videoConsent,
    },
  });

  await lockCapsuleDay(db, storeId);
  const day = bogotaDate(now);
  if (plan.channel === "STORE" && bogotaMinutes(now) < minutesOf(plan.opensAtLocal)) {
    throw ErrorFactory.Conflict(`Los cupos de cápsulas de hoy abren a las ${formatOpensAt(plan.opensAtLocal)}`);
  }
  const [override, slots] = await Promise.all([
    db.capsuleDayCap.findUnique({ where: { storeId_bogotaDate: { storeId, bogotaDate: day } }, select: { cap: true } }),
    daySlots(db, storeId, day, now),
  ]);
  if (slots.dead.length > 0) await db.capsuleDailySlot.deleteMany({ where: { orderId: { in: slots.dead.map((slot) => slot.orderId) } } });
  const taken = slots.active;
  const cap = override?.cap ?? plan.dailyOrderCap;
  if (taken.length >= cap) {
    throw ErrorFactory.Conflict(
      plan.channel === "STORE"
        ? `Hoy ya no quedan cupos de cápsulas. Vuelve mañana a las ${formatOpensAt(plan.opensAtLocal)}`
        : `Hoy ya se usaron los ${cap} cupos de cápsulas: sube el tope de hoy en «Sacar cápsulas» para registrar este pedido`,
    );
  }
  await db.capsuleDailySlot.create({
    data: {
      storeId,
      bogotaDate: day,
      slotNumber: firstFree(taken.map((row) => row.slotNumber)),
      orderId,
      status: CapsuleDailySlotStatus.HELD,
      expiresAt: new Date(now.getTime() + CAPSULE_HOLD_MINUTES * 60 * 1000),
    },
  });
}
