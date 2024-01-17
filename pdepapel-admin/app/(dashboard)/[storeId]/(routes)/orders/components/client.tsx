"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { OrderColumn, columns } from "./columns";

interface OrderClientProps {
  data: OrderColumn[];
}

export const OrderClient = ({ data }: OrderClientProps) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Órdenes (${data.length})`}
          description="Maneja las órdenes de tu tienda"
        />
        <Button onClick={() => router.push(`/${params.storeId}/orders/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Crear orden
        </Button>
      </div>
      <Separator />
      <DataTable searchKey="orderNumber" columns={columns} data={data} />
      <Heading title="API" description="API calls para las órdenes" />
      <Separator />
      <ApiList entityName="orders" entityIdName="orderId" />
    </>
  );
};
