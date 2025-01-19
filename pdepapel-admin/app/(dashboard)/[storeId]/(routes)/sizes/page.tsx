import { SizesClient } from "./components/client";
import { getSizes } from "./server/get-sizes";

export default async function SizesPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const sizes = await getSizes(params.storeId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <SizesClient data={sizes} />
      </div>
    </div>
  );
}
