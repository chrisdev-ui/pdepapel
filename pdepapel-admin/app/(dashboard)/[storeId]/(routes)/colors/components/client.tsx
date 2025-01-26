"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { ColorColumn, columns } from "./columns";

interface ColorsClientProps {
  data: ColorColumn[];
}

const ColorsClient: React.FC<ColorsClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Colores (${data.length})`}
          description="Maneja los colores para tu tienda"
        />
        <Button
          onClick={() => router.push(`/${params.storeId}/${Models.Colors}/new`)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear color
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Colors}
        searchKey="name"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para los colores" />
      <Separator />
      <ApiList entityName={Models.Colors} entityIdName="colorId" />
    </>
  );
};

export default ColorsClient;
