import { notFound } from "next/navigation";

import { getAttributeSiblings, getAttributeUsage } from "@/lib/attribute-usage";
import prismadb from "@/lib/prismadb";
import { ColorForm } from "./components/color-form";

export default async function ColorPage({
  params,
}: {
  params: { colorId: string; storeId: string };
}) {
  const isNew = params.colorId === "nuevo";

  // Siempre acotado por tienda: un id ajeno o inexistente no abre el formulario de «nuevo».
  const color = isNew ? null : await prismadb.color.findFirst({ where: { id: params.colorId, storeId: params.storeId } });
  if (!isNew && !color) notFound();

  const [usage, siblings] = await Promise.all([
    color ? getAttributeUsage(prismadb, { storeId: params.storeId, kind: "colors", id: color.id }) : { activeProducts: 0, archivedProducts: 0, groups: 0 },
    getAttributeSiblings(prismadb, "colors", params.storeId),
  ]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <ColorForm initialData={color} usage={usage} siblings={siblings} />
    </div>
  );
}
