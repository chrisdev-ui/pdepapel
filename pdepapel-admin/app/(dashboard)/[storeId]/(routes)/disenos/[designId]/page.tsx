import { DesignForm } from "./components/design-form";
import { getDesign } from "./server/get-design";

export default async function DesignPage({
  params,
}: {
  params: { designId: string };
}) {
  const design = await getDesign(params.designId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <DesignForm initialData={design} />
      </div>
    </div>
  );
}
