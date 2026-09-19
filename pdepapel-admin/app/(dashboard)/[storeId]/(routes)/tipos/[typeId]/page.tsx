import { notFound } from "next/navigation";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { TypeForm } from "./components/type-form";
import { getType } from "./server/get-type";

export default async function TypePage({
  params,
}: {
  params: { typeId: string; storeId: string };
}) {
  const isNew = params.typeId === "nuevo";
  const [type, siblings] = await Promise.all([
    isNew ? null : getType(params.storeId, params.typeId),
    prismadb.type.findMany({ where: { storeId: params.storeId, isArchived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { categories: true } } } }),
  ]);

  // Un id de otra tienda o inexistente no debe abrir el formulario de «nueva».
  if (!isNew && !type) notFound();

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <TypeForm
        initialData={type}
        // Solo el servidor sabe si hay clave; el cliente nunca ve su valor.
        aiIconConfigured={Boolean(env.GEMINI_API_KEY)}
        siblings={siblings.map((row) => ({ id: row.id, name: row.name, usage: row._count.categories }))}
      />
    </div>
  );
}
