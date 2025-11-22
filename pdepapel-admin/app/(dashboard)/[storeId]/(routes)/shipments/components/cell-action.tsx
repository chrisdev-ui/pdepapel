"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { ShippingProvider } from "@prisma/client";
import { ExternalLink, Eye, MoreHorizontal, RefreshCw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ShipmentColumn } from "./columns";

interface CellActionProps {
  data: ShipmentColumn;
}

export function CellAction({ data }: CellActionProps) {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const canUpdateTracking =
    data.provider === ShippingProvider.ENVIOCLICK && data.envioClickIdOrder;

  const handleUpdateTracking = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/${params.storeId}/${Models.Shipments}/${data.id}/update-tracking`,
        { method: "POST" },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error al actualizar rastreo");
      }

      const result = await response.json();

      toast({
        title: "Rastreo actualizado",
        description: `Estado: ${result.trackingInfo.status}`,
      });

      router.refresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          getErrorMessage(error) || "No se pudo actualizar el rastreo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Abrir menú</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Acciones</DropdownMenuLabel>

        {data.order && (
          <>
            <DropdownMenuItem
              onClick={() =>
                router.push(`/${params.storeId}/orders/${data.order!.id}`)
              }
            >
              <Eye className="mr-2 h-4 w-4" />
              Ver orden
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {data.guideUrl && (
          <DropdownMenuItem
            onClick={() => window.open(data.guideUrl!, "_blank")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Ver guía PDF
          </DropdownMenuItem>
        )}

        {canUpdateTracking && (
          <DropdownMenuItem onClick={handleUpdateTracking} disabled={loading}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Actualizando..." : "Actualizar rastreo"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
