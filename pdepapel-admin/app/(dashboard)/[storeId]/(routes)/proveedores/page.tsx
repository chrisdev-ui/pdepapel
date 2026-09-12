import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getSuppliers } from "./server/get-suppliers";

const SupplierClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Proveedores | PdePapel Admin",
  description: "Gestión de proveedores",
};

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
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <SupplierClient data={suppliers} />
      </div>
    </div>
  );
}
