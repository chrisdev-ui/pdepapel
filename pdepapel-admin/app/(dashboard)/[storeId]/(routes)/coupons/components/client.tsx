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
import { useCallback, useId, useState } from "react";
import { CouponColumn, columns } from "./columns";

interface CouponClientProps {
  data: CouponColumn[];
}

const CouponClient: React.FC<CouponClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const id = useId();

  const [loading, setLoading] = useState(false);

  const handleUpdate = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.post<{ message: string }>(
        `/api/${params.storeId}/${Models.Coupons}/update-validity`,
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
          title={`Cupones (${data.length})`}
          description="Maneja los cupones de tu tienda"
        />
        <div className="flex items-center gap-x-2">
          <Button onClick={handleUpdate} disabled={loading} variant="outline">
            {loading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Actualizando...
              </>
            ) : (
              "Actualizar validez de cupones"
            )}
          </Button>
          <Button
            onClick={() =>
              router.push(`/${params.storeId}/${Models.Coupons}/new`)
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear cupón
          </Button>
        </div>
      </div>
      <Separator />
      <DataTable
        key={id}
        tableKey={Models.Coupons}
        searchKey="code"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para los cupones" />
      <Separator />
      <ApiList entityName={Models.Coupons} entityIdName="couponId" />
    </>
  );
};

export default CouponClient;
