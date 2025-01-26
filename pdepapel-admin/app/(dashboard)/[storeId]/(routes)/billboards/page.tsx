import dynamic from "next/dynamic";
import { getBillboards } from "./server/get-billboards";

const BillboardClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

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
