import { ColorForm } from "./components/color-form";
import { getColor } from "./server/get-color";

export default async function ColorPage({
  params,
}: {
  params: { colorId: string };
}) {
  const color = await getColor(params.colorId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ColorForm initialData={color} />
      </div>
    </div>
  );
}
