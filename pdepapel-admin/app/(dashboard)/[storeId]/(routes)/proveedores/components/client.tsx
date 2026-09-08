"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { SupplierColumn, columns } from "./columns";

interface SupplierClientProps {
  data: SupplierColumn[];
}

const SupplierClient: React.FC<SupplierClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Heading
          title={`Proveedores (${data.length})`}
          description="Maneja los proveedores de tu tienda"
        />
        <Button
          onClick={() =>
            router.push(`/${params.storeId}/${Models.Suppliers}/new`)
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear proveedor
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Suppliers}
        searchKey="name"
        columns={columns}
        data={data}
      />
    </>
  );
};

export default SupplierClient;
