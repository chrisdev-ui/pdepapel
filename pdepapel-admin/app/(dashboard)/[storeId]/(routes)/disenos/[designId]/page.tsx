import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";
import { DesignForm } from "./components/design-form";

export default async function DesignPage({
  params,
}: {
  params: { designId: string; storeId: string };
}) {
  const isNew = params.designId === "new";

  // Siempre acotado por tienda: un id ajeno o inexistente no abre el formulario de «nuevo».
  const design = isNew ? null : await prismadb.design.findFirst({ where: { id: params.designId, storeId: params.storeId } });
  if (!isNew && !design) notFound();

  const [activeProducts, archivedProducts] = design
    ? await Promise.all([
        prismadb.product.count({ where: { storeId: params.storeId, designId: design.id, isArchived: false } }),
        prismadb.product.count({ where: { storeId: params.storeId, designId: design.id, isArchived: true } }),
      ])
    : [0, 0];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <DesignForm initialData={design} usage={{ activeProducts, archivedProducts }} />
    </div>
  );
}
