"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { currencyFormatter } from "@/lib/utils";
import axios from "axios";
import { Copy, Send } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

interface BiRiskDrilldownProps {
  type: "dead_stock" | "stockout" | "inactive" | "vip" | "top_products";
  count: number;
  data: any[];
}

export const BiRiskDrilldown: React.FC<BiRiskDrilldownProps> = ({
  type,
  count,
  data,
}) => {
  const { toast } = useToast();
  const params = useParams();
  const [isReactivating, setIsReactivating] = useState(false);

  const isDanger = type === "dead_stock" || type === "stockout";

  const getTitle = () => {
    switch (type) {
      case "dead_stock":
        return "Inventario Muerto (Detalle)";
      case "stockout":
        return "Riesgo de Stockout (Detalle)";
      case "inactive":
        return "Clientes Inactivos (Detalle)";
      case "vip":
        return "Clientes VIP (Detalle)";
      case "top_products":
        return "Ranking de Productos por Rentabilidad";
      default:
        return "Detalle";
    }
  };

  const getDescription = () => {
    switch (type) {
      case "dead_stock":
        return "Productos sin movimiento en más de 60 días.";
      case "stockout":
        return "Productos con inventario proyectado a agotarse en menos de 7 días.";
      case "inactive":
        return "Clientes que no te compran hace más de 90 días.";
      case "vip":
        return "Top 20% de tus clientes por Life-Time Value (LTV).";
      case "top_products":
        return "Análisis de ganancia neta pura por producto despachado en este periodo.";
      default:
        return "";
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast({
      description: "Correo copiado al portapapeles",
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className={`cursor-pointer font-bold transition-all hover:underline hover:opacity-75 ${isDanger ? (type === "dead_stock" ? "text-red-500" : "text-orange-500") : type === "vip" ? "text-emerald-500" : "text-blue-500"}`}
        >
          {count}
        </div>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] sm:max-w-[600px]">
        <DialogHeader className="flex flex-row items-start justify-between">
          <div>
            <DialogTitle>{getTitle()}</DialogTitle>
            <DialogDescription>{getDescription()}</DialogDescription>
          </div>
          {type === "inactive" && data.length > 0 && (
            <Button
              size="sm"
              disabled={isReactivating}
              onClick={async () => {
                try {
                  setIsReactivating(true);
                  const res = await axios.post(
                    `/api/${params.storeId}/customers/reactivation`,
                  );
                  toast({
                    title: "Campaña iniciada",
                    description: `Se reactivaron ${res.data.processed} clientes exitosamente.`,
                  });
                } catch (error) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description:
                      "Hubo un problema procesando las reactivaciones.",
                  });
                } finally {
                  setIsReactivating(false);
                }
              }}
              className="mr-6 mt-2 bg-emerald-600 hover:bg-emerald-700" // Added mr-6 to prevent overlapping with the "x" close button
            >
              <Send className="mr-2 h-4 w-4" />
              {isReactivating ? "Enviando..." : "Reactivar a Todos"}
            </Button>
          )}
        </DialogHeader>

        <ScrollArea className="h-[400px] w-full rounded-md border p-4">
          <div className="space-y-4">
            {data.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                No hay registros para mostrar en esta categoría.
              </p>
            ) : type === "top_products" ? (
              // Top Products Ranking Drilldown
              data.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-4 font-bold text-muted-foreground">
                      {index + 1}
                    </div>
                    <div>
                      <p className="max-w-[400px] text-sm font-medium">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Margen de ganancia: {item.profitMarginPct.toFixed(1)}% (
                        {item.totalQuantitySold} uds vivas)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {currencyFormatter(item.totalProfit)}
                    </span>
                  </div>
                </div>
              ))
            ) : type === "dead_stock" || type === "stockout" ? (
              // Products DrilLdown
              data.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Stock Actual: {item.stock ?? item.currentStock} unidades
                    </p>
                  </div>
                  <div className="text-right">
                    {type === "dead_stock" ? (
                      <span className="text-xs font-semibold text-red-500">
                        {item.daysSinceLastSale !== null
                          ? `${item.daysSinceLastSale}d estancado`
                          : "Nunca vendido"}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-orange-500">
                        {item.daysUntilStockout === 0
                          ? "Agotado"
                          : `Quedan ${item.daysUntilStockout.toFixed(1)} días`}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              // Customers Drilldown (VIP / Inactive)
              data.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">
                      {item.email || "Cliente Anónimo"}
                    </p>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>{item.totalOrders} pedidos</span>
                      <span>•</span>
                      <span>
                        {item.daysSinceLastPurchase}d desde última compra
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {currencyFormatter(item.totalSpent)}
                    </span>
                    {item.email && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyEmail(item.email)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
