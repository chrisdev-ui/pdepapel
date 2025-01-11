import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { SupplierClient } from "./components/client";
import { SupplierColumn } from "./components/columns";

export default async function SuppliersPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const suppliers = await prismadb.supplier.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  const formattedSuppliers: SupplierColumn[] = suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    createdAt: format(supplier.createdAt, "MMMM d, yyyy"),
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <SupplierClient data={formattedSuppliers} />
      </div>
    </div>
  );
}
