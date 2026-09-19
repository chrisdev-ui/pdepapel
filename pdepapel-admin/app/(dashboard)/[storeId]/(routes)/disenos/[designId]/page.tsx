import { notFound } from "next/navigation";

import { getAttributeSiblings, getAttributeUsage } from "@/lib/attribute-usage";
import prismadb from "@/lib/prismadb";
import { DesignForm } from "./components/design-form";

export default async function DesignPage({
  params,
}: {
  params: { designId: string; storeId: string };
}) {
  const isNew = params.designId === "nuevo";

  // Siempre acotado por tienda: un id ajeno o inexistente no abre el formulario de «nuevo».
  const design = isNew ? null : await prismadb.design.findFirst({ where: { id: params.designId, storeId: params.storeId } });
  if (!isNew && !design) notFound();

  const [usage, siblings] = await Promise.all([
    design ? getAttributeUsage(prismadb, { storeId: params.storeId, kind: "designs", id: design.id }) : { activeProducts: 0, archivedProducts: 0, groups: 0 },
    getAttributeSiblings(prismadb, "designs", params.storeId),
  ]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <DesignForm initialData={design} usage={usage} siblings={siblings} />
    </div>
  );
}
