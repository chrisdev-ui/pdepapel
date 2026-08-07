import { getFairEventDetail } from "@/lib/fair-events";

import {
  FairEventWorkspace,
  type FairEventDetail,
} from "./components/fair-event-workspace";

export const revalidate = 0;

export default async function FairEventPage({
  params,
}: {
  params: { storeId: string; fairEventId: string };
}) {
  const fairEvent = await getFairEventDetail(
    params.storeId,
    params.fairEventId,
  );

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
        acqPrice:
          item.product.acqPrice === null ? null : Number(item.product.acqPrice),
        gtin: item.product.gtin,
        images: item.product.images,
      },
    })),
    capsules: fairEvent.capsules.map((capsule) => ({
      id: capsule.id,
      code: capsule.code,
      salePrice: Number(capsule.salePrice),
      productCost: Number(capsule.productCost),
      minimumMarginPct: Number(capsule.minimumMarginPct),
      status: capsule.status,
      product: capsule.product,
    })),
    orders: fairEvent.orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
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
    <div className="flex-col">
      <div className="flex-1 p-4 pt-6 sm:p-8 sm:pt-6">
        <FairEventWorkspace event={event} />
      </div>
    </div>
  );
}
