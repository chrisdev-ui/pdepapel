"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { SupplierColumn, columns } from "./columns";

interface SupplierClientProps {
  data: SupplierColumn[];
}

export const SupplierClient = ({ data }: SupplierClientProps) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Proveedores (${data.length})`}
          description="Maneja los proveedores de tu tienda"
        />
        <Button onClick={() => router.push(`/${params.storeId}/suppliers/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Crear proveedor
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey="suppliers"
        searchKey="name"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para los proveedores" />
      <Separator />
      <ApiList entityName="suppliers" entityIdName="supplierId" />
    </>
  );
};
