"use client";

import { DataTable } from "@/components/ui/data-table";
import { Models } from "@/constants";
import { columns, InventoryProductColumn } from "./columns";

interface InventoryClientProps {
  data: InventoryProductColumn[];
}

export const InventoryClient: React.FC<InventoryClientProps> = ({ data }) => {
  return (
    <DataTable
      tableKey={Models.Inventory}
      searchKey="name"
      columns={columns}
      data={data}
    />
  );
};
