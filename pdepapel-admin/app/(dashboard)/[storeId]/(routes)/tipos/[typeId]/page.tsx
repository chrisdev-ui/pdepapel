import { notFound } from "next/navigation";

import { env } from "@/lib/env.mjs";
import { TypeForm } from "./components/type-form";
import { getType } from "./server/get-type";

export default async function TypePage({
  params,
}: {
  params: { typeId: string; storeId: string };
}) {
  const isNew = params.typeId === "new";
  const type = isNew ? null : await getType(params.storeId, params.typeId);

  // Un id de otra tienda o inexistente no debe abrir el formulario de «nueva».
  if (!isNew && !type) notFound();

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <TypeForm
        initialData={type}
        // Solo el servidor sabe si hay clave; el cliente nunca ve su valor.
        aiIconConfigured={Boolean(env.GEMINI_API_KEY)}
      />
    </div>
  );
}
