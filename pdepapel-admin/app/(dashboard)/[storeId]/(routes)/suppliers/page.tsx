import { SupplierClient } from "./components/client";
import { getSuppliers } from "./server/get-suppliers";

export default async function SuppliersPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const suppliers = await getSuppliers(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <SupplierClient data={suppliers} />
      </div>
    </div>
  );
}
