import { DesignsClient } from "./components/client";
import { getDesigns } from "./server/get-designs";

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
