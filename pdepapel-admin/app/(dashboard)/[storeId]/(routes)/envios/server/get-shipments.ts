import { OrderStatus, OrderType, ShippingStatus } from "@prisma/client";

import { DISPATCH_WINDOW_DAYS } from "@/lib/dashboard-today";
import prismadb from "@/lib/prismadb";

/** Lista completa de envíos de la tienda; las vistas se resuelven en el cliente. */
export async function getShipments(storeId: string) {
  const shipments = await prismadb.shipping.findMany({
    where: { storeId },
    select: {
      id: true,
      storeId: true,
      trackingCode: true,
      trackingUrl: true,
      carrierName: true,
      courier: true,
      cost: true,
      status: true,
      provider: true,
      envioClickIdOrder: true,
      guideUrl: true,
      estimatedDeliveryDate: true,
      createdAt: true,
      updatedAt: true,
      trackingEvents: {
        select: { timestamp: true },
        orderBy: { timestamp: "asc" },
        take: 1,
      },
      order: {
        select: {
          id: true,
          orderNumber: true,
          fullName: true,
          phone: true,
          address: true,
          city: true,
          status: true,
          type: true,
          payment: { select: { method: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return shipments.map(({ trackingEvents, order, ...shipment }) => ({
    ...shipment,
    firstEventAt: trackingEvents[0]?.timestamp ?? null,
    order: order
      ? {
          id: order.id,
          orderNumber: order.orderNumber,
          fullName: order.fullName,
          phone: order.phone,
          address: order.address,
          city: order.city,
          status: order.status,
          type: order.type,
          paymentMethod: order.payment?.method ?? null,
        }
      : null,
  }));
}

export type ShipmentRow = Awaited<ReturnType<typeof getShipments>>[number];

/** Envíos en preparación de pedidos pagados o contra entrega, con sus productos, para la lista de recogida. */
export async function getDispatchQueue(storeId: string) {
  return prismadb.shipping.findMany({
    where: {
      storeId,
      status: ShippingStatus.Preparing,
      createdAt: { gte: new Date(Date.now() - DISPATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
      order: {
        type: { in: [OrderType.STANDARD, OrderType.CUSTOM, OrderType.QUOTATION] },
        status: { in: [OrderStatus.PAID, OrderStatus.PENDING, OrderStatus.CREATED] },
      },
    },
    select: {
      id: true,
      trackingCode: true,
      carrierName: true,
      courier: true,
      order: {
        select: {
          orderNumber: true,
          fullName: true,
          city: true,
          status: true,
          type: true,
          payment: { select: { method: true } },
          orderItems: {
            select: {
              quantity: true,
              product: { select: { name: true, sku: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export type DispatchShipment = Awaited<ReturnType<typeof getDispatchQueue>>[number];
