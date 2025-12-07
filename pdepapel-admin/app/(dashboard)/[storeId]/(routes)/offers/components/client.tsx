"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import axios from "axios";
import { Loader, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useState } from "react";
import { OfferColumn, columns } from "./columns";

interface OffersClientProps {
  data: OfferColumn[];
}

const OffersClient: React.FC<OffersClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleUpdate = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.post<{ message: string }>(
        `/api/${params.storeId}/${Models.Offers}/update-validity`,
      );
      router.refresh();
      toast({
        description: response.data.message,
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [params.storeId, router, toast]);

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Ofertas (${data.length})`}
          description="Maneja las ofertas y descuentos para tu tienda"
        />
        <div className="flex items-center gap-x-2">
          <Button onClick={handleUpdate} disabled={loading} variant="outline">
            {loading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Actualizando...
              </>
            ) : (
              "Actualizar validez de ofertas"
            )}
          </Button>
          <Button
            onClick={() =>
              router.push(`/${params.storeId}/${Models.Offers}/new`)
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear oferta
          </Button>
        </div>
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
