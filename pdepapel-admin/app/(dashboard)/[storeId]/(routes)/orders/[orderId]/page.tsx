import { OrderForm } from "./components/order-form";
import { getOrder } from "./server/get-order";

export default async function OrderPage({
  params,
}: {
  params: { orderId: string; storeId: string };
}) {
  const { order, products } = await getOrder(params.orderId, params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OrderForm products={products} initialData={order} />
      </div>
    </div>
  );
}
