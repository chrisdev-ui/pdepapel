"use server";

import prismadb from "@/lib/prismadb";
import { currencyFormatter, formatPhoneNumber } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getOrders(storeId: string) {
  const orders = await prismadb.order.findMany({
    where: {
      storeId,
    },
    include: {
      orderItems: {
        include: {
          product: {
            include: {
              images: true,
            },
          },
        },
      },
      shipping: true,
      payment: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    fullname: order.fullName,
    phone: formatPhoneNumber(order.phone),
    address: order.address,
    documentId: order.documentId,
    products: order.orderItems.map((orderItem) => ({
      id: orderItem.product.id,
      name: orderItem.product.name,
      quantity: orderItem.quantity,
      image:
        orderItem.product.images.find((image) => image.isMain)?.url ??
        orderItem.product.images[0].url,
    })),
    totalPrice: currencyFormatter.format(
      order.orderItems.reduce(
        (total, orderItem) =>
          total + Number(orderItem.product.price) * orderItem.quantity,
        0,
      ),
    ),
    status: order.status,
    shippingStatus: order?.shipping?.status,
    paymentMethod: order?.payment?.method,
    createdAt: format(order.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
