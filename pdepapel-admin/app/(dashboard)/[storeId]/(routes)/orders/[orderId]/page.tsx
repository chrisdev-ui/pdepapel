import prismadb from "@/lib/prismadb";
import { OrderForm } from "./components/order-form";

export default async function OrderPage({
  params,
}: {
  params: { orderId: string; storeId: string };
}) {
  const order = await prismadb.order.findUnique({
    where: {
      id: params.orderId,
    },
    include: {
      orderItems: true,
      payment: true,
      shipping: true,
    },
  });
  const products = await prismadb.product.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  const formattedProducts = products.map((product) => ({
    value: product.id,
    label: product.name,
    price: product.price,
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OrderForm products={formattedProducts} initialData={order} />
      </div>
    </div>
  );
}
