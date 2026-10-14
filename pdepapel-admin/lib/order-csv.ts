import type { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";

import { ModelsColumns, Models, paymentNames, shippingOptions, statusOptions } from "@/constants";

/** Lo que trae una fila de Pedidos y usa la exportación; nada más se carga para exportar. */
export interface OrderCsvSource {
  orderNumber: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  total: number;
  status: OrderStatus;
  createdAt: Date | string;
  orderItems: { quantity: number; name: string | null; product: { name: string } | null }[];
  payment: { method: PaymentMethod | null } | null;
  shipping: { status: ShippingStatus } | null;
}

const bogota = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });

/**
 * Las columnas de `ModelsColumns[Orders]` a partir de la fila liviana de
 * Pedidos. Antes la exportación leía esas claves tal cual de la fila y cuatro
 * (productos, método de pago, total y envío) no existían: salían vacías.
 */
export function orderCsvValues(order: OrderCsvSource): Record<keyof (typeof ModelsColumns)[Models.Orders], string | number> {
  return {
    orderNumber: order.orderNumber,
    products: order.orderItems.map((item) => `${item.quantity} × ${item.product?.name ?? item.name ?? "Producto"}`).join("; "),
    phone: order.phone ?? "",
    address: [order.address, order.city].filter(Boolean).join(", "),
    paymentMethod: order.payment?.method ? paymentNames[order.payment.method] : "",
    totalPrice: order.total,
    status: statusOptions[order.status] ?? order.status,
    shippingStatus: order.shipping ? (shippingOptions[order.shipping.status] ?? order.shipping.status) : "Sin envío",
    createdAt: bogota.format(new Date(order.createdAt)),
  };
}
