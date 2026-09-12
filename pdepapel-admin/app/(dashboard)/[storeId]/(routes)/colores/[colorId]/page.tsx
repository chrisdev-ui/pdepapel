import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";
import { ColorForm } from "./components/color-form";

export default async function ColorPage({
  params,
}: {
  params: { colorId: string; storeId: string };
}) {
  const isNew = params.colorId === "new";

  // Siempre acotado por tienda: un id ajeno o inexistente no abre el formulario de «nuevo».
  const color = isNew ? null : await prismadb.color.findFirst({ where: { id: params.colorId, storeId: params.storeId } });
  if (!isNew && !color) notFound();

  const [activeProducts, archivedProducts] = color
    ? await Promise.all([
        prismadb.product.count({ where: { storeId: params.storeId, colorId: color.id, isArchived: false } }),
        prismadb.product.count({ where: { storeId: params.storeId, colorId: color.id, isArchived: true } }),
      ])
    : [0, 0];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <ColorForm initialData={color} usage={{ activeProducts, archivedProducts }} />
    </div>
  );
}
