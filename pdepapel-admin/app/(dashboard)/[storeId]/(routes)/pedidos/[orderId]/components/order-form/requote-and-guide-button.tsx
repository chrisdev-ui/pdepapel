"use client";

import axios, { isAxiosError } from "axios";
import { RefreshCw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { currencyFormatter } from "@/lib/utils";

interface PriceChange {
  previousCost: number;
  newCost: number;
  carrier: string;
}

/**
 * Recotizar y crear la guía en una sola acción.
 *
 * Recuperar una tarifa vencida eran cinco pasos: bajar a Envío, esperar a que
 * cotizara sola, elegir transportadora, guardar y pedir la guía. Solo se
 * pregunta cuando el precio cambia de verdad; dentro del margen, sigue sola.
 */
export function RequoteAndGuideButton({ disabled }: { disabled?: boolean }) {
  const params = useParams<{ storeId: string; orderId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [change, setChange] = useState<PriceChange | null>(null);

  const run = async (confirm: boolean) => {
    try {
      setLoading(true);
      const { data } = await axios.post(
        `/api/${params.storeId}/orders/${params.orderId}/shipping/requote-and-guide`,
        { confirm },
      );
      setChange(null);
      toast({
        title: "Guía creada",
        description: `${data.carrier} · ${currencyFormatter(Number(data.cost))}`,
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      const payload = isAxiosError(error) ? error.response?.data : null;
      if (payload?.outcome === "price_changed") {
        setChange({
          previousCost: Number(payload.previousCost),
          newCost: Number(payload.newCost),
          carrier: payload.carrier,
        });
        return;
      }
      setChange(null);
      toast({
        title: "No se pudo recotizar",
        description: payload?.message || getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const diff = change ? change.newCost - change.previousCost : 0;

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="shrink-0"
        disabled={disabled || loading}
        isLoading={loading}
        loadingText="Recotizando…"
        onClick={() => run(false)}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Recotizar y crear guía
      </Button>

      <AlertDialog open={change !== null} onOpenChange={(open) => !open && setChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>El envío cambió de precio</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm">
                <span>
                  {change?.carrier} cobra ahora{" "}
                  <strong>{currencyFormatter(change?.newCost ?? 0)}</strong>, y el
                  pedido tiene guardado {currencyFormatter(change?.previousCost ?? 0)}.
                </span>
                <span className={diff > 0 ? "text-destructive" : undefined}>
                  {diff > 0
                    ? `Son ${currencyFormatter(diff)} más de lo previsto.`
                    : `Son ${currencyFormatter(Math.abs(diff))} menos.`}
                </span>
                <span className="text-muted-foreground">
                  Crear la guía cobra ese valor y no se puede deshacer.
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>No, dejarlo así</AlertDialogCancel>
            <AlertDialogAction disabled={loading} onClick={() => run(true)}>
              Sí, crear la guía
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
