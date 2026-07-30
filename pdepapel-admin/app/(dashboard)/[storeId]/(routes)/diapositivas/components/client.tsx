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
import { BillboardColumn, columns } from "./columns";

interface BillboardClientProps {
  data: BillboardColumn[];
}

const BillboardClient: React.FC<BillboardClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Diapositivas (${data.length})`}
          description="Maneja las diapositivas para tu tienda"
        />
        <Button
          onClick={() =>
            router.push(`/${params.storeId}/${Models.Billboards}/new`)
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear diapositiva
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Billboards}
        searchKey="label"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para las diapositivas" />
      <Separator />
      <ApiList entityName={Models.Billboards} entityIdName="billboardId" />
    </>
  );
};

export default BillboardClient;
