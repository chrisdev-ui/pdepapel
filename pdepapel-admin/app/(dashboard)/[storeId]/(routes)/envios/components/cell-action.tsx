"use client";

import { ShippingProvider } from "@prisma/client";
import { ExternalLink, MoreHorizontal, PackageOpen, RefreshCw, Truck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

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
import { cn } from "@/lib/utils";

import type { ShipmentColumn } from "./columns";

interface CellActionProps {
  data: ShipmentColumn;
}

export function CellAction({ data }: CellActionProps) {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const canUpdateTracking = data.provider === ShippingProvider.ENVIOCLICK && data.envioClickIdOrder;
  const trackingHref = data.trackingUrl || (data.trackingCode ? `https://www.envioclick.com/co/track/${data.trackingCode}` : null);

  const handleUpdateTracking = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/${params.storeId}/${Models.Shipments}/${data.id}/update-tracking`, { method: "POST" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error al actualizar rastreo");
      }
      const result = await response.json();
      toast({ title: "Rastreo actualizado", description: `Estado: ${result.trackingInfo.status}` });
      router.refresh();
    } catch (error) {
      toast({
        title: "No se pudo actualizar el rastreo",
        description: getErrorMessage(error) || "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" onClick={(event) => event.stopPropagation()}>
          <span className="sr-only">Abrir menú</span>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>Envío</DropdownMenuLabel>
        {data.order && (
          <>
            <DropdownMenuItem onClick={() => router.push(`/${params.storeId}/pedidos/${data.order!.id}#envio`)}>
              <PackageOpen className="mr-2 h-4 w-4" aria-hidden="true" />
              Abrir en el pedido
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {data.guideUrl && (
          <DropdownMenuItem onClick={() => window.open(data.guideUrl!, "_blank", "noopener")}>
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
            Ver guía PDF
          </DropdownMenuItem>
        )}
        {trackingHref && (
          <DropdownMenuItem onClick={() => window.open(trackingHref, "_blank", "noopener")}>
            <Truck className="mr-2 h-4 w-4" aria-hidden="true" />
            Rastrear envío
          </DropdownMenuItem>
        )}
        {canUpdateTracking && (
          <DropdownMenuItem onClick={handleUpdateTracking} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            {loading ? "Actualizando…" : "Actualizar rastreo"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
