import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import { v4 as uuidv4 } from "uuid";
import { getRestockOrders } from "./server/get-restock-orders";

const RestockOrderClient = dynamicImport(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Aprovisionamiento | PdePapel Admin",
  description: "Gestión de pedidos de aprovisionamiento",
};

export default async function RestockOrdersPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const restockOrders = await getRestockOrders(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <RestockOrderClient data={restockOrders} key={uuidv4()} />
      </div>
    </div>
  );
}
