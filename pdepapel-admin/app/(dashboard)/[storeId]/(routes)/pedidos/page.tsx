import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import { parseOrderListQuery } from "@/lib/order-list";

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
  searchParams,
}: {
  params: { storeId: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const query = parseOrderListQuery(searchParams);
  const result = await getOrders(params.storeId, query);

  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <OrderClient
        data={result.orders}
        counts={result.counts}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        pageSize={result.pageSize}
        totalOrders={result.totalOrders}
        search={query.search}
      />
    </div>
  );
}
