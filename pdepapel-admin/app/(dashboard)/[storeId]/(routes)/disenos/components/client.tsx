"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { DesignColumn, columns } from "./columns";

interface DesignsClientProps {
  data: DesignColumn[];
}

const DesignsClient: React.FC<DesignsClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Diseños (${data.length})`}
          description="Maneja los diseños para tu tienda"
        />
        <Button
          onClick={() =>
            router.push(`/${params.storeId}/${Models.Designs}/new`)
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear diseño
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Designs}
        searchKey="name"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para los diseños" />
      <Separator />
      <ApiList entityName={Models.Designs} entityIdName="designId" />
    </>
  );
};

export default DesignsClient;
