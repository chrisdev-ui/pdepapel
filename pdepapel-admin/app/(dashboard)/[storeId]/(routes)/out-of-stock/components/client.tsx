"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { ArrowBigLeft } from "lucide-react";
import Link from "next/link";
import { columns, OutOfStockColumn } from "./columns";

interface OutOfStockClientProps {
  data: OutOfStockColumn[];
}

const OutOfStockClient: React.FC<OutOfStockClientProps> = ({ data }) => {
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Productos completamente agotados (${data.length})`}
          description="Maneja los productos agotados en tu tienda"
        />
        <div className="flex items-center gap-x-2">
          <RefreshButton />
          <Button asChild>
            <Link href="/">
              <ArrowBigLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Link>
          </Button>
        </div>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.OutOfStock}
        searchKey="name"
        columns={columns}
        data={data}
      />
    </>
  );
};

export default OutOfStockClient;
