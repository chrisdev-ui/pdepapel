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
import { OrderColumn, columns } from "./columns";

interface OrderClientProps {
  data: OrderColumn[];
}

const OrderClient: React.FC<OrderClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const id = useId();

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Órdenes (${data.length})`}
          description="Maneja las órdenes de tu tienda"
        />
        <div className="flex gap-2">
          <RefreshButton />
          <Button
            onClick={() =>
              router.push(`/${params.storeId}/${Models.Orders}/new`)
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear orden
          </Button>
        </div>
      </div>
      <Separator />
      <DataTable
        key={id}
        tableKey={Models.Orders}
        searchKey="phone"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para las órdenes" />
      <Separator />
      <ApiList entityName={Models.Orders} entityIdName="orderId" />
    </>
  );
};

export default OrderClient;
