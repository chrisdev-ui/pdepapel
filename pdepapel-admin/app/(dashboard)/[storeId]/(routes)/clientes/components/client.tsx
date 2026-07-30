"use client";

import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { CustomerColumn, columns } from "./columns";

interface CustomerClientProps {
  data: CustomerColumn[];
}

const CustomerClient: React.FC<CustomerClientProps> = ({ data }) => {
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Clientes (${data.length})`}
          description="Maneja y analiza la información de tus clientes"
        />
        <div className="flex gap-2">
          <RefreshButton />
        </div>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Customers}
        searchKey="fullName"
        columns={columns}
        data={data}
      />
    </>
  );
};

export default CustomerClient;
