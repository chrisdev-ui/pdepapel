"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React from "react";
import { ProductColumn, columns } from "./columns";

interface ProductClientProps {
  data: ProductColumn[];
}

const ProductClient: React.FC<ProductClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Productos (${data.length})`}
          description="Maneja los productos para tu tienda"
        />
        <Button
          onClick={() =>
            router.push(`/${params.storeId}/${Models.Products}/new`)
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear producto
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Products}
        searchKey="name"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para los productos" />
      <Separator />
      <ApiList entityName={Models.Products} entityIdName="productId" />
    </>
  );
};

export default ProductClient;
