import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";
import { SizeForm } from "./components/size-form";

export default async function SizePage({
  params,
}: {
  params: { sizeId: string; storeId: string };
}) {
  const isNew = params.sizeId === "new";

  // Siempre acotado por tienda: un id ajeno o inexistente no abre el formulario de «nuevo».
  const size = isNew ? null : await prismadb.size.findFirst({ where: { id: params.sizeId, storeId: params.storeId } });
  if (!isNew && !size) notFound();

  const [activeProducts, archivedProducts] = size
    ? await Promise.all([
        prismadb.product.count({ where: { storeId: params.storeId, sizeId: size.id, isArchived: false } }),
        prismadb.product.count({ where: { storeId: params.storeId, sizeId: size.id, isArchived: true } }),
      ])
    : [0, 0];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <SizeForm initialData={size} usage={{ activeProducts, archivedProducts }} />
    </div>
  );
}
