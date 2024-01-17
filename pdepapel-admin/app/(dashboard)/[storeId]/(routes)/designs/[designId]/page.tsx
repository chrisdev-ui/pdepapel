import prismadb from "@/lib/prismadb";
import { DesignForm } from "./components/design-form";

export default async function DesignPage({
  params,
}: {
  params: { designId: string };
}) {
  const design = await prismadb.design.findUnique({
    where: {
      id: params.designId,
    },
  });
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <DesignForm initialData={design} />
      </div>
    </div>
  );
}
