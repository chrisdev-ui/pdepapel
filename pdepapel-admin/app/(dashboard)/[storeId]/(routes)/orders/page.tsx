import prismadb from "@/lib/prismadb";
import { formatter } from "@/lib/utils";
import { format } from "date-fns";
import { OrderClient } from "./components/client";
import { OrderColumn } from "./components/columns";

export default async function OrdersPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const orders = await prismadb.order.findMany({
    where: {
      storeId: params.storeId,
    },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
      shipping: true,
      payment: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedOrders: OrderColumn[] = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    fullname: order.fullName,
    phone: order.phone,
    address: order.address,
    documentId: order.documentId,
    products: order.orderItems.map((orderItem) => orderItem.product.name),
    totalPrice: formatter.format(
      order.orderItems.reduce(
        (total, orderItem) =>
          total + Number(orderItem.product.price) * orderItem.quantity,
        0,
      ),
    ),
    status: order.status,
    shippingStatus: order?.shipping?.status,
    createdAt: format(order.createdAt, "MMMM d, yyyy"),
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OrderClient data={formattedOrders} />
      </div>
    </div>
  );
}
