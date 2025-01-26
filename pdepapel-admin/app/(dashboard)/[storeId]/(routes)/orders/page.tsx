import dynamic from "next/dynamic";
import { getOrders } from "./server/get-orders";

const OrderClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export default async function OrdersPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const orders = await getOrders(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OrderClient data={orders} />
      </div>
    </div>
  );
}
