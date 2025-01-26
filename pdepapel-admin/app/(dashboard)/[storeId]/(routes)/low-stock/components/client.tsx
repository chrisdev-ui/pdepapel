"use client";

import { TresholdSelector } from "@/components/treshold-selector";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { ArrowBigLeft } from "lucide-react";
import Link from "next/link";
import { columns, LowStockColumn } from "./columns";

interface LowStockClientProps {
  data: LowStockColumn[];
}

const LowStockClient: React.FC<LowStockClientProps> = ({ data }) => {
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Productos por agotarse (${data.length})`}
          description="Maneja los productos por agotarse de tu tienda"
        />
        <Button asChild>
          <Link href="/">
            <ArrowBigLeft className="mr-2 h-4 w-4" />
            Volver al inicio
          </Link>
        </Button>
      </div>
      <Separator />
      <div className="flex items-center gap-x-3">
        <p>
          Los productos con stock menor a la cantidad configurada en el selector
          de límite de stock se mostrarán aquí.
        </p>
        <TresholdSelector />
      </div>
      <DataTable
        tableKey={Models.LowStock}
        searchKey="name"
        columns={columns}
        data={data}
      />
    </>
  );
};

export default LowStockClient;
