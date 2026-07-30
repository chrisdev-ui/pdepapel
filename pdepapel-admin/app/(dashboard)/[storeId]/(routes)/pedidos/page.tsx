import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import { v4 as uuidv4 } from "uuid";
import { getOrders } from "./server/get-orders";

const OrderClient = dynamicImport(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Pedidos | PdePapel Admin",
  description: "Gestión de pedidos",
};

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
        <OrderClient data={orders} key={uuidv4()} />
      </div>
    </div>
  );
}
