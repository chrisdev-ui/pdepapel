import { SizeForm } from "./components/size-form";
import { getSize } from "./server/get-size";

export default async function SizePage({
  params,
}: {
  params: { sizeId: string };
}) {
  const size = await getSize(params.sizeId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <SizeForm initialData={size} />
      </div>
    </div>
  );
}
