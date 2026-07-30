import { TypeForm } from "./components/type-form";
import { getType } from "./server/get-type";

export default async function TypePage({
  params,
}: {
  params: { typeId: string };
}) {
  const type = await getType(params.typeId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <TypeForm initialData={type} />
      </div>
    </div>
  );
}
