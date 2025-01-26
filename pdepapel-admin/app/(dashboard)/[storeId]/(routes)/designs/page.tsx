import dynamic from "next/dynamic";
import { getDesigns } from "./server/get-designs";

const DesignsClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export default async function DesignsPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const designs = await getDesigns(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <DesignsClient data={designs} />
      </div>
    </div>
  );
}
