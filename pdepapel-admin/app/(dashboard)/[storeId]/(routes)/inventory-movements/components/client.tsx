"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Models } from "@/constants";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { AdjustInventoryModal } from "./adjust-inventory-modal";
import { columns, InventoryMovementColumn, typeLabels } from "./columns";

interface InventoryMovementClientProps {
  data: InventoryMovementColumn[];
  products: { id: string; name: string; stock: number }[];
}

export const InventoryMovementClient: React.FC<
  InventoryMovementClientProps
> = ({ data, products }) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const filters = [
    {
      columnKey: "type",
      title: "Tipo",
      options: Object.entries(typeLabels).map(([value, label]) => ({
        label,
        value,
      })),
    },
  ];

  return (
    <>
      <AdjustInventoryModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          router.refresh();
        }}
        products={products}
      />
      <div className="flex items-center justify-between">
        <Heading
          title={`Movimientos de Inventario (${data.length})`}
          description="Historial completo de cambios en el stock."
        />
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Ajustar Inventario
        </Button>
      </div>
      <Separator />
      <DataTable
        searchKey="productName"
        columns={columns}
        data={data}
        tableKey={Models.InventoryMovements}
        filters={filters}
      />
    </>
  );
};
