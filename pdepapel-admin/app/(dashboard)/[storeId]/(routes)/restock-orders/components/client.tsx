"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useId } from "react";
import { RestockOrderColumn, columns } from "./columns";

interface RestockOrderClientProps {
  data: RestockOrderColumn[];
}

export const RestockOrderClient: React.FC<RestockOrderClientProps> = ({
  data,
}) => {
  const router = useRouter();
  const params = useParams();
  const id = useId();

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Pedidos de Aprovisionamiento (${data.length})`}
          description="Gestiona tus pedidos a proveedores"
        />
        <div className="flex gap-2">
          <RefreshButton />
          <Button
            onClick={() => router.push(`/${params.storeId}/restock-orders/new`)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear pedido
          </Button>
        </div>
      </div>
      <Separator />
      <DataTable
        key={id}
        tableKey={Models.RestockOrders}
        searchKey="orderNumber"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para aprovisionamiento" />
      <Separator />
      <ApiList entityName={Models.RestockOrders} entityIdName="orderId" />
    </>
  );
};

export default RestockOrderClient;
