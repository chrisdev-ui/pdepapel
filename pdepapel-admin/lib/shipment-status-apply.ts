import { deductStockForShippedOrder } from "@/lib/order-stock-movements";
import { isPaidLike, reconcileShipmentStatus } from "@/lib/order-transitions";
import type { OrderStatus, OrderType, PaymentMethod, Prisma, PrismaClient, ShippingStatus } from "@prisma/client";

/**
 * Escribe un cambio de estado de envío y mantiene coherente el pedido. Solo
 * servidor: descontar inventario arrastra los helpers de stock, que no pueden
 * llegar al navegador.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface ApplyShipmentStatusInput {
  shippingId: string;
  storeId: string;
  status: ShippingStatus;
  /** Otros campos del envío que llegan con la novedad (guía, fechas). */
  extra?: Pick<Prisma.ShippingUncheckedUpdateInput, "trackingCode" | "pickupDate" | "estimatedDeliveryDate" | "actualDeliveryDate">;
  /** Con `true`, se escribe aunque el estado no cambie (una novedad real de la transportadora). */
  touch?: boolean;
}

export interface ApplyShipmentStatusResult {
  shipmentChanged: boolean;
  previousStatus: ShippingStatus;
  status: ShippingStatus;
  orderStatus: OrderStatus;
  orderChanged: boolean;
  /** Productos cuyo stock bajó porque el pedido salió de bodega con este cambio. */
  stockProductIds: string[];
}

/**
 * Escribe el estado del envío solo cuando cambia (o cuando `touch` dice que
 * hubo novedad), así `updatedAt` sigue midiendo el silencio real de la
 * transportadora para la señal «sin novedades». Después mueve el pedido a
 * «Enviado» si el envío arrancó y la transición está permitida
 * (`reconcileShipmentStatus`): un pedido cancelado no vuelve a «Enviado» por
 * un evento tardío.
 */
export async function applyShipmentStatus(db: Db, input: ApplyShipmentStatusInput): Promise<ApplyShipmentStatusResult | null> {
  const shipping = await db.shipping.findFirst({
    where: { id: input.shippingId, storeId: input.storeId },
    select: {
      id: true,
      status: true,
      orderId: true,
      order: { select: { id: true, status: true, type: true, orderNumber: true, payment: { select: { method: true } } } },
    },
  });
  if (!shipping) return null;

  const previousStatus = shipping.status;
  const extra = input.extra ?? {};
  const hasExtra = Object.values(extra).some((value) => value !== undefined);
  const shipmentChanged = input.status !== previousStatus;

  if (shipmentChanged || hasExtra || input.touch) {
    await db.shipping.update({
      where: { id: shipping.id },
      data: { ...(shipmentChanged ? { status: input.status } : {}), ...extra },
    });
  }

  let orderStatus = shipping.order.status;
  let orderChanged = false;
  const reconciled = reconcileShipmentStatus({
    from: shipping.order.status,
    shippingStatus: previousStatus,
    requestedShippingStatus: input.status,
    context: { type: shipping.order.type as OrderType, paymentMethod: (shipping.order.payment?.method as PaymentMethod | undefined) ?? null },
  });
  let stockProductIds: string[] = [];
  if (reconciled.status && reconciled.status !== shipping.order.status) {
    // Condicionado al estado leído: dos novedades a la vez no descuentan dos veces.
    const moved = await db.order.updateMany({
      where: { id: shipping.orderId, storeId: input.storeId, status: shipping.order.status },
      data: { status: reconciled.status },
    });
    if (moved.count === 1) {
      orderStatus = reconciled.status;
      orderChanged = true;
      if (isPaidLike(reconciled.status) && !isPaidLike(shipping.order.status)) {
        stockProductIds = await deductStockForShippedOrder(db, {
          id: shipping.orderId,
          storeId: input.storeId,
          orderNumber: shipping.order.orderNumber,
        });
      }
    }
  }

  return { shipmentChanged, previousStatus, status: input.status, orderStatus, orderChanged, stockProductIds };
}
