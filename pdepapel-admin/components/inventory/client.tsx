"use client";

import { DataTable } from "@/components/ui/data-table";
import { columns, InventoryProductColumn } from "./columns";

interface InventoryClientProps {
  data: InventoryProductColumn[];
}

export const InventoryClient: React.FC<InventoryClientProps> = ({ data }) => {
  return (
    <DataTable
      tableKey="inventory"
      searchKey="name"
      columns={columns}
      data={data}
    />
  );
};
