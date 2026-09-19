import { notFound } from "next/navigation";

import { getAttributeSiblings, getAttributeUsage } from "@/lib/attribute-usage";
import prismadb from "@/lib/prismadb";
import { SizeForm } from "./components/size-form";

export default async function SizePage({
  params,
}: {
  params: { sizeId: string; storeId: string };
}) {
  const isNew = params.sizeId === "nuevo";

  // Siempre acotado por tienda: un id ajeno o inexistente no abre el formulario de «nuevo».
  const size = isNew ? null : await prismadb.size.findFirst({ where: { id: params.sizeId, storeId: params.storeId } });
  if (!isNew && !size) notFound();

  const [usage, siblings] = await Promise.all([
    size ? getAttributeUsage(prismadb, { storeId: params.storeId, kind: "sizes", id: size.id }) : { activeProducts: 0, archivedProducts: 0, groups: 0 },
    getAttributeSiblings(prismadb, "sizes", params.storeId),
  ]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <SizeForm initialData={size} usage={usage} siblings={siblings} />
    </div>
  );
}
