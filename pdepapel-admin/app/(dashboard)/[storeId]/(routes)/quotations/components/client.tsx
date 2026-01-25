"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useId } from "react";
import { QuotationColumn, columns } from "./columns";

interface QuotationClientProps {
  data: QuotationColumn[];
}

export const QuotationClient: React.FC<QuotationClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const id = useId();

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Cotizaciones & Plantillas (${data.length})`}
          description="Gestiona plantillas de listas escolares y cotizaciones base"
        />
        <div className="flex gap-2">
          <RefreshButton />
          <Button
            onClick={() => router.push(`/${params.storeId}/quotations/new`)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva Plantilla
          </Button>
        </div>
      </div>
      <Separator />
      <DataTable
        key={id}
        tableKey={Models.Quotations}
        searchKey="name"
        columns={columns}
        data={data}
      />
    </>
  );
};
