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
import { SizeColumn, columns } from "./columns";

interface SizesClientProps {
  data: SizeColumn[];
}

const SizesClient: React.FC<SizesClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Tamaños (${data.length})`}
          description="Maneja los tamaños para tu tienda"
        />
        <Button
          onClick={() => router.push(`/${params.storeId}/${Models.Sizes}/new`)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear tamaño
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Sizes}
        searchKey="name"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para los tamaños" />
      <Separator />
      <ApiList entityName={Models.Sizes} entityIdName="sizeId" />
    </>
  );
};

export default SizesClient;
