import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import { getOrders } from "./server/get-orders";

const OrderClient = dynamicImport(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Pedidos | PdePapel Admin",
  description: "Gestión de pedidos",
};

export default async function OrdersPage({ params }: { params: { storeId: string } }) {
  const orders = await getOrders(params.storeId);

  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <OrderClient data={orders} />
    </div>
  );
}
