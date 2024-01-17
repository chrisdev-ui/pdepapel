import prismadb from "@/lib/prismadb";
import { TypeForm } from "./components/type-form";

export default async function TypePage({
  params,
}: {
  params: { typeId: string };
}) {
  const type = await prismadb.type.findUnique({
    where: {
      id: params.typeId,
    },
  });
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <TypeForm initialData={type} />
      </div>
    </div>
  );
}
