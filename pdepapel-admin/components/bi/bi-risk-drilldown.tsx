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
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { currencyFormatter } from "@/lib/utils";
import axios from "axios";
import { ChevronRight, Copy, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

type DrilldownType =
  | "dead_stock"
  | "stockout"
  | "inactive"
  | "vip"
  | "top_products";

interface BiRiskDrilldownProps {
  type: DrilldownType;
  count: number;
  data: any[];
}

const COPY: Record<
  DrilldownType,
  { title: string; description: string; action: string; empty: string }
> = {
  dead_stock: {
    title: "Productos sin rotación",
    description:
      "Productos activos que llevan más de 60 días sin venderse. Ocupan espacio y tienen tu plata quieta.",
    action: "Ver los que no rotan",
    empty: "Ninguno lleva 60 días sin venderse. Todo está en movimiento.",
  },
  stockout: {
    title: "Se van a agotar pronto",
    description:
      "Con el ritmo de venta de ahora, el stock alcanza para menos de 7 días.",
    action: "Ver los que se agotan",
    empty: "Ninguno se agota en la próxima semana.",
  },
  inactive: {
    title: "Clientes que no compran hace 90 días",
    description:
      "Ya te compraron antes y llevan cerca de tres meses sin volver.",
    action: "Ver los inactivos",
    empty: "Nadie lleva 90 días sin volver.",
  },
  vip: {
    title: "Tus mejores clientes",
    description: "El grupo que más ha comprado, medido por el total gastado.",
    action: "Ver los mejores clientes",
    empty: "Todavía no hay suficientes compras para armar el grupo.",
  },
  top_products: {
    title: "Los que más te dejan",
    description:
      "Ganancia real del período, ya descontadas comisiones y envío.",
    action: "Ver el ranking completo",
    empty: "Todavía no hay ventas con costo cargado en este período.",
  },
};

export const BiRiskDrilldown: React.FC<BiRiskDrilldownProps> = ({
  type,
  count,
  data,
}) => {
  const { toast } = useToast();
  const params = useParams();
  const router = useRouter();
  const [isReactivating, setIsReactivating] = useState(false);
  const [isConfirmingReactivation, setIsConfirmingReactivation] =
    useState(false);

  const storeId = String(params.storeId ?? "");
  const copy = COPY[type];
  const isProductList =
    type === "dead_stock" || type === "stockout" || type === "top_products";

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast({ description: "Correo copiado al portapapeles" });
  };

  const reactivate = async () => {
    try {
      setIsReactivating(true);
      const res = await axios.post(`/api/${storeId}/customers/reactivation`);
      const processed = res.data?.processed || 0;
      toast({
        title: "Campaña de reactivación",
        description:
          processed > 0
            ? `Se enviaron correos a ${processed} cliente(s) exitosamente.`
            : "Todos los clientes elegibles ya fueron contactados recientemente (protección anti-spam de 60 días).",
      });
      router.refresh();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Hubo un problema procesando las reactivaciones.",
      });
    } finally {
      setIsReactivating(false);
      setIsConfirmingReactivation(false);
    }
  };

  const productHref = (item: any) =>
    `/${storeId}/productos/${item.id ?? item.productId}`;

  /*
    «Ver 0» abría un diálogo vacío para decir que no hay nada. Cuando no hay
    nada, la respuesta cabe en la propia fila y no hace falta abrir nada.
  */
  if (count === 0) {
    return <TintBadge tone="mint" label="ninguno" />;
  }

  return (
    <Dialog>
      {/*
        El disparador era un `<div>` con `cursor-pointer`: nada decía que se
        pudiera pulsar, el tabulador se lo saltaba y el número medía 15 px.
        Ahora es un botón de verdad, dice qué abre y alcanza los 44 px.
      */}
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver {count}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">— {copy.title}</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {type === "inactive" && data.length > 0 && (
          <div className="rounded-xl border bg-muted/40 p-3">
            {/*
              Este botón manda correos de verdad a clientes de verdad, y no se
              puede deshacer. Antes salía de un solo clic, sin decir a cuántos.
              Ahora el envío pasa por una confirmación que nombra la cifra.
            */}
            {isConfirmingReactivation ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-primary">
                  Se enviará el correo de reactivación a{" "}
                  <strong>{data.length} cliente(s)</strong> ahora mismo. No se
                  puede deshacer. Los que ya recibieron uno en los últimos 60
                  días quedan fuera automáticamente.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={reactivate}
                    disabled={isReactivating}
                  >
                    {isReactivating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Sí, enviar a {data.length}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsConfirmingReactivation(false)}
                    disabled={isReactivating}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Puedes escribirles a todos de una vez.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsConfirmingReactivation(true)}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Enviar correo de reactivación…
                </Button>
              </div>
            )}
          </div>
        )}

        <ScrollArea className="h-[400px] w-full rounded-md border p-4">
          <div className="flex flex-col">
            {data.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {copy.empty}
              </p>
            ) : isProductList ? (
              data.map((item, index) => (
                <Link
                  key={item.id ?? item.productId ?? index}
                  href={productHref(item)}
                  className="flex items-center gap-3 border-b py-2.5 last:border-0 hover:bg-accent/50"
                >
                  {type === "top_products" && (
                    <span className="w-4 shrink-0 text-xs font-bold text-muted-foreground">
                      {index + 1}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-primary underline-offset-2 hover:underline">
                      {item.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {type === "top_products"
                        ? `${item.profitMarginPct.toFixed(1)} % de margen · ${item.totalQuantitySold} uds`
                        : `${item.stock ?? item.currentStock} unidades en stock`}
                    </span>
                  </span>
                  {type === "top_products" ? (
                    <span className="shrink-0 text-sm font-bold text-primary tabular-nums">
                      {currencyFormatter(item.totalProfit)}
                    </span>
                  ) : type === "dead_stock" ? (
                    <TintBadge
                      tone="pink"
                      label={
                        item.daysSinceLastSale !== null
                          ? `${item.daysSinceLastSale} días quieto`
                          : "nunca vendido"
                      }
                    />
                  ) : (
                    <TintBadge
                      tone="cream"
                      label={
                        item.daysUntilStockout === 0
                          ? "agotado"
                          : `quedan ${item.daysUntilStockout.toFixed(1)} días`
                      }
                    />
                  )}
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))
            ) : (
              data.map((item, index) => (
                <div
                  key={item.email ?? index}
                  className="flex items-center gap-3 border-b py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary">
                      {item.email || "Cliente sin correo"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.totalOrders}{" "}
                      {item.totalOrders === 1 ? "pedido" : "pedidos"} · última
                      compra hace {item.daysSinceLastPurchase} días
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-primary tabular-nums">
                    {currencyFormatter(item.totalSpent)}
                  </span>
                  {item.email && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      aria-label={`Copiar el correo de ${item.email}`}
                      onClick={() => copyEmail(item.email)}
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {!isProductList && (
          <Link
            href={`/${storeId}/clientes`}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Abrir Clientes
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
};
