import { BillboardClient } from "./components/client";
import { getBillboards } from "./server/get-billboards";

export default async function BillboardsPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const billboards = await getBillboards(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <BillboardClient data={billboards} />
      </div>
    </div>
  );
}
