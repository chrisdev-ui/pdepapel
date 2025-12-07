import { getLowStock } from "@/actions/get-low-stock-count";
import dynamic from "next/dynamic";

const LowStockClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bajo Stock | PdePapel Admin",
  description: "Productos con bajo inventario",
};

export default async function LowStockPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams: { treshold?: string };
}) {
  const treshold = searchParams.treshold
    ? parseInt(searchParams.treshold)
    : undefined;

  const lowStockProducts = await getLowStock(params.storeId, treshold);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <LowStockClient data={lowStockProducts} />
      </div>
    </div>
  );
}
