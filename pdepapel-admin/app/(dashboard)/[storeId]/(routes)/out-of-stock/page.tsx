import { getOutOfStock } from "@/actions/get-out-of-stock-count";
import dynamic from "next/dynamic";

const OutOfStockClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export default async function OutOfStockPage({
  params,
}: {
  params: { storeId: string };
}) {
  const outOfStockProducts = await getOutOfStock(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OutOfStockClient data={outOfStockProducts} />
      </div>
    </div>
  );
}
