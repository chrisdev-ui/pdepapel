import { getFairEventDetail } from "@/lib/fair-events";
import { requireStoreRead } from "@/lib/store-access";
import { scrubFairEvent } from "@/lib/viewer-payloads";

import {
  FairEventWorkspace,
  type FairEventDetail,
} from "./components/fair-event-workspace";

export const revalidate = 0;

/**
 * `scrubFairEvent` **borra** el campo en vez de ponerlo en cero, así que aquí
 * hay que distinguir «no vino» de «vino en null»: `Number(undefined)` es NaN y
 * eso sí llegaría al navegador.
 */
const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/**
 * Solo lectura: la feria se ve sin el costo de compra de cada producto ni lo
 * que costó armar una cápsula. `GET /api/[storeId]/fair-events/[fairEventId]`
 * ya lo hacía; esta página llamaba a la carga directa y entregaba el detalle
 * entero al navegador, así que el depurador existía y no se aplicaba aquí.
 */
export default async function FairEventPage({
  params,
}: {
  params: { storeId: string; fairEventId: string };
}) {
  const access = await requireStoreRead(params.storeId);
  const detail = await getFairEventDetail(params.storeId, params.fairEventId);
  const fairEvent =
    access.role === "viewer" ? scrubFairEvent(detail) : detail;

  const event: FairEventDetail = {
    id: fairEvent.id,
    name: fairEvent.name,
    location: fairEvent.location,
    startsAt: fairEvent.startsAt?.toISOString() || null,
    endsAt: fairEvent.endsAt?.toISOString() || null,
    status: fairEvent.status,
    notes: fairEvent.notes,
    openedAt: fairEvent.openedAt?.toISOString() || null,
    closedAt: fairEvent.closedAt?.toISOString() || null,
    updatedAt: fairEvent.updatedAt.toISOString(),
    inventoryItems: fairEvent.inventoryItems.map((item) => ({
      id: item.id,
      productId: item.productId,
      allocatedQuantity: item.allocatedQuantity,
      soldQuantity: item.soldQuantity,
      packedQuantity: item.packedQuantity,
      returnedQuantity: item.returnedQuantity,
      damagedQuantity: item.damagedQuantity,
      lostQuantity: item.lostQuantity,
      product: {
        id: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        stock: item.product.stock,
        price: Number(item.product.price),
        acqPrice: toNumberOrNull(item.product.acqPrice),
        gtin: item.product.gtin,
        images: item.product.images,
      },
    })),
    capsules: fairEvent.capsules.map((capsule) => ({
      id: capsule.id,
      code: capsule.code,
      salePrice: Number(capsule.salePrice),
      productCost: toNumberOrNull(capsule.productCost),
      minimumMarginPct: toNumberOrNull(capsule.minimumMarginPct),
      status: capsule.status,
      product: capsule.product,
    })),
    orders: fairEvent.orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status === "CANCELLED" ? "CANCELLED" : "PAID",
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
      payment: order.payment
        ? { method: order.payment.method as "CASH" | "BankTransfer" }
        : null,
      orderItems: order.orderItems.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: Number(item.price),
      })),
    })),
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <FairEventWorkspace event={event} />
    </div>
  );
}
