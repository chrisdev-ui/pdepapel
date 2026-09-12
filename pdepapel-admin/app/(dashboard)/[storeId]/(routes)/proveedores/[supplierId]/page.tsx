import { notFound } from "next/navigation";

import { SupplierForm } from "./components/supplier-form";
import { getSupplier } from "./server/get-supplier";

const NEW_SEGMENTS = new Set(["nuevo", "new"]);

export default async function SupplierPage({
  params,
}: {
  params: { supplierId: string; storeId: string };
}) {
  const isNew = NEW_SEGMENTS.has(params.supplierId);
  const supplier = isNew
    ? null
    : await getSupplier(params.storeId, params.supplierId);

  // Un id de otra tienda o inexistente no debe abrir el formulario de «nuevo».
  if (!isNew && !supplier) notFound();

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <SupplierForm initialData={supplier} />
      </div>
    </div>
  );
}
