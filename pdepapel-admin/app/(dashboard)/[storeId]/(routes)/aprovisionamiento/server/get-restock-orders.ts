import prismadb from "@/lib/prismadb";
import { displayRestockOrderNumber, getRestockProgress } from "@/lib/restock-orders";
import { requireStoreOwner } from "@/lib/store-access";

/**
 * Lista de pedidos con su progreso de recepción; `supplierId` filtra por proveedor.
 *
 * Solo la dueña: cada fila lleva el costo de la compra, y `GET
 * /api/[storeId]/restock-orders` ya se reserva por lo mismo. Función de
 * servidor normal (sin `"use server"`): solo la llama la página.
 */
export const getRestockOrders = async (storeId: string, supplierId?: string | null) => {
  await requireStoreOwner(storeId);
  const restockOrders = await prismadb.restockOrder.findMany({
    where: { storeId, ...(supplierId ? { supplierId } : {}) },
    include: {
      supplier: { select: { id: true, name: true, leadTimeDays: true } },
      items: { select: { id: true, quantity: true, quantityReceived: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return restockOrders.map((order) => ({
    id: order.id,
    // Con los mismos ceros aunque en la base haya quedado un «PO-5».
    orderNumber: displayRestockOrderNumber(order.orderNumber),
    status: order.status,
    supplier: { id: order.supplier.id, name: order.supplier.name },
    supplierId: order.supplierId,
    /** Plazo del proveedor; `null` en casi todos hoy, y la lista lo dice en vez de estimar. */
    supplierLeadTimeDays: order.supplier.leadTimeDays,
    totalAmount: order.totalAmount,
    shippingCost: order.shippingCost,
    total: Math.round((order.totalAmount + order.shippingCost) * 100) / 100,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    progress: getRestockProgress(order.items),
  }));
};

export type RestockOrderRow = Awaited<ReturnType<typeof getRestockOrders>>[number];
