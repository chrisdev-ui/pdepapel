import { Prisma, PrismaClient } from "@prisma/client";

type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export type ReservationEventKind =
  | "created"
  | "item_added"
  | "item_quantity"
  | "item_removed"
  | "customer_edited"
  | "extended"
  | "converted"
  | "released"
  | "expired"
  | "consumed"
  | "unbacked";

export interface ReservationEventInput {
  storeId: string;
  reservationId: string;
  kind: ReservationEventKind;
  actor: string | null;
  productId?: string | null;
  quantity?: number | null;
  previousQuantity?: number | null;
  detail?: Prisma.InputJsonValue;
}

/** Se escribe en la misma transacción que el cambio: si se deshace, el historial tampoco existe. */
export async function recordReservationEvents(tx: PrismaTx, events: ReservationEventInput[]): Promise<void> {
  if (events.length === 0) return;
  await tx.stockReservationEvent.createMany({
    data: events.map((event) => ({
      storeId: event.storeId,
      reservationId: event.reservationId,
      kind: event.kind,
      actor: event.actor,
      productId: event.productId ?? null,
      quantity: event.quantity ?? null,
      previousQuantity: event.previousQuantity ?? null,
      detail: event.detail ?? Prisma.JsonNull,
    })),
  });
}
