"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React from "react";
import { OfferColumn, columns } from "./columns";

interface OffersClientProps {
  data: OfferColumn[];
}

const OffersClient: React.FC<OffersClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Ofertas (${data.length})`}
          description="Maneja las ofertas y descuentos para tu tienda"
        />
        <Button
          onClick={() => router.push(`/${params.storeId}/${Models.Offers}/new`)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear oferta
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Offers}
        searchKey="name"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para las ofertas" />
      <Separator />
      <ApiList entityName={Models.Offers} entityIdName="offerId" />
    </>
  );
};

export default OffersClient;
