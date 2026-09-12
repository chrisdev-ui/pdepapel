import { ShippingStatus } from "@prisma/client";

import { DISPATCH_WINDOW_DAYS } from "@/lib/dashboard-today";
import prismadb from "@/lib/prismadb";
import { isReadyToDispatch } from "@/lib/shipment-views";

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

/**
 * Cola de despacho para la lista de recogida: los envíos en preparación de la
 * ventana, filtrados con la misma regla que la pestaña «Por despachar»
 * (`isReadyToDispatch`), con los productos de cada pedido (snapshot de la
 * línea, producto y componentes del kit).
 */
export async function getDispatchQueue(storeId: string) {
  const now = new Date();
  const shipments = await prismadb.shipping.findMany({
    where: {
      storeId,
      status: ShippingStatus.Preparing,
      createdAt: { gte: new Date(now.getTime() - DISPATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      trackingCode: true,
      carrierName: true,
      courier: true,
      status: true,
      createdAt: true,
      updatedAt: true,
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
              name: true,
              sku: true,
              productId: true,
              product: {
                select: {
                  name: true,
                  sku: true,
                  isKit: true,
                  kitComponents: {
                    select: {
                      quantity: true,
                      component: { select: { id: true, name: true, sku: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return shipments.flatMap(({ order, ...shipment }) => {
    if (!order) return [];
    const { payment, ...rest } = order;
    const candidate = { ...shipment, order: { ...rest, paymentMethod: payment?.method ?? null } };
    return isReadyToDispatch(candidate, now) ? [candidate] : [];
  });
}

export type DispatchShipment = Awaited<ReturnType<typeof getDispatchQueue>>[number];
