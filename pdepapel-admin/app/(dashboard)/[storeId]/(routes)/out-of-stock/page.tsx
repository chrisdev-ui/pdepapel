import { getOutOfStock } from "@/actions/get-out-of-stock-count";
import { OutOfStockClient } from "./components/client";

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
