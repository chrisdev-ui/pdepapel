"use server";

import { requireStoreRead } from "@/lib/store-access";

import { listOrderPage, type OrderListQuery } from "@/lib/order-list";
import prismadb from "@/lib/prismadb";
import { scrubOrder } from "@/lib/viewer-payloads";
import { headers } from "next/headers";

/**
 * Solo lo que pintan la tabla, la tarjeta del celular y el menú de cada fila,
 * para los pedidos de una página. De cada producto, una sola foto (la
 * principal); la línea guarda además la suya por si el producto ya no existe.
 */
const ORDER_ROW_SELECT = {
  id: true,
  orderNumber: true,
  type: true,
  fullName: true,
  phone: true,
  address: true,
  city: true,
  documentId: true,
  isGift: true,
  giftRecipientName: true,
  riskScore: true,
  riskReasons: true,
  giftCardReview: true,
  total: true,
  status: true,
  createdAt: true,
  paidAt: true,
  expiresAt: true,
  orderItems: {
    select: {
      quantity: true,
      name: true,
      sku: true,
      imageUrl: true,
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          images: { where: { isMain: true }, take: 1, select: { url: true, isMain: true } },
        },
      },
    },
  },
  shipping: { select: { status: true, trackingCode: true, courier: true, updatedAt: true } },
  payment: { select: { method: true } },
  _count: { select: { inventoryIssues: { where: { resolvedAt: null } } } },
} as const;

export async function getOrders(storeId: string, query: OrderListQuery) {
  const access = await requireStoreRead(storeId);
  headers();
  const [page, totalOrders] = await Promise.all([
    listOrderPage(prismadb, storeId, query),
    prismadb.order.count({ where: { storeId } }),
  ]);
  const rows = page.ids.length
    ? await prismadb.order.findMany({ where: { id: { in: page.ids }, storeId }, select: ORDER_ROW_SELECT })
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const orders = page.ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    const { _count, ...order } = row;
    return [
      {
        // Solo lectura: sin contacto de la clienta ni utilidad del pedido.
        ...(access.role === "viewer" ? scrubOrder(order) : order),
        openInventoryIssues: _count.inventoryIssues,
      },
    ];
  });
  return { orders, counts: page.counts, total: page.total, page: page.page, pageCount: page.pageCount, pageSize: page.pageSize, totalOrders };
}
