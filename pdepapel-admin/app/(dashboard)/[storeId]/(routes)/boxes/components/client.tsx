"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";

import { Models } from "@/constants";
import { BoxColumn, columns } from "./columns";

interface BoxClientProps {
  data: BoxColumn[];
}

export const BoxClient: React.FC<BoxClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Cajas (${data.length})`}
          description="Gestiona las cajas de tu tienda"
        />
        <Button onClick={() => router.push(`/${params.storeId}/boxes/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Nuevo
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Boxes}
        searchKey="name"
        columns={columns}
        data={data}
      />
    </>
  );
};
