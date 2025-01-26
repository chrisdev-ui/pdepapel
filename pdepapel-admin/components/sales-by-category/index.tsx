"use client";

import { Models } from "@/constants";
import { DataTable } from "../ui/data-table";
import { columns, SalesByCategoryColumn } from "./column";

interface SalesByCategoryProps {
  data: SalesByCategoryColumn[];
}

export const SalesByCategory: React.FC<SalesByCategoryProps> = ({ data }) => {
  return (
    <DataTable
      tableKey={Models.SalesByCategory}
      searchKey="category"
      columns={columns}
      data={data}
    />
  );
};
