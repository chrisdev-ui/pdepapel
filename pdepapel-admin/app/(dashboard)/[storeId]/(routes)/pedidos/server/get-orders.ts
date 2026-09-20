"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";
import { scrubOrder } from "@/lib/viewer-payloads";
import { headers } from "next/headers";

export async function getOrders(storeId: string) {
  const access = await requireStoreRead(storeId);
  headers();
  const orders = await prismadb.order.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      orderNumber: true,
      type: true,
      fullName: true,
      phone: true,
      address: true,
      city: true,
      documentId: true,
      total: true,
      status: true,
      createdAt: true,
      paidAt: true,
      expiresAt: true,
      orderItems: {
        select: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              price: true,
              images: true,
            },
          },
          quantity: true,
          name: true,
          sku: true,
          imageUrl: true,
          price: true,
        },
      },
      shipping: {
        select: {
          status: true,
          trackingCode: true,
          courier: true,
          updatedAt: true,
        },
      },
      payment: {
        select: {
          method: true,
        },
      },
      _count: {
        select: { inventoryIssues: { where: { resolvedAt: null } } },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return orders.map(({ _count, ...order }) => ({
    // Solo lectura: sin contacto de la clienta ni utilidad del pedido.
    ...(access.role === "viewer" ? scrubOrder(order) : order),
    openInventoryIssues: _count.inventoryIssues,
  }));
}
