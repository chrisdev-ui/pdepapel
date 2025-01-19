import { SupplierForm } from "./components/supplier-form";
import { getSupplier } from "./server/get-supplier";

export default async function SupplierPage({
  params,
}: {
  params: { supplierId: string; storeId: string };
}) {
  const supplier = await getSupplier(params.supplierId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <SupplierForm initialData={supplier} />
      </div>
    </div>
  );
}
