"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { canCreateGuide } from "@/lib/order-transitions";
import { cn, currencyFormatter } from "@/lib/utils";
import type { OrderStatus } from "@prisma/client";
import axios from "axios";
import { Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "../confirm-dialog";

interface GuidePanelProps {
  storeId: string;
  orderId: string;
  status: OrderStatus;
  isCOD: boolean;
  carrier: string;
  cost: number;
  /** La tarifa elegida es la que está guardada en el pedido. */
  saved: boolean;
  /** La tarifa guardada lleva más de dos horas. */
  stale: boolean;
  guideError?: string | null;
  disabled?: boolean;
}

/**
 * El único botón que crea la guía de EnvioClick. Dice por qué no se puede
 * cuando no se puede: tarifa sin guardar, tarifa vencida o pedido sin pagar.
 */
export function GuidePanel({
  storeId,
  orderId,
  status,
  isCOD,
  carrier,
  cost,
  saved,
  stale,
  guideError,
  disabled = false,
}: GuidePanelProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const payable = canCreateGuide(status, isCOD);
  const reason = !saved
    ? "Guarda el pedido para poder crear la guía con esta tarifa."
    : stale
      ? "La tarifa lleva más de 2 h guardada. Cotiza de nuevo, elige una tarifa y guarda."
      : !payable
        ? "Disponible cuando el pedido esté pagado (o sea contra entrega)."
        : null;
  const ready = reason === null;

  const create = async () => {
    setCreating(true);
    try {
      const response = await axios.post(
        `/api/${storeId}/orders/${orderId}/shipping/create-guide`,
      );
      const tracker = response.data?.data?.tracker;
      toast({
        title: "Guía creada",
        description: tracker ? `Número de guía ${tracker}.` : undefined,
        variant: "success",
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3.5",
        ready ? "border-[#B8E8C8] bg-tint-mint" : "border-border bg-white",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-bold text-primary">
            Guía de EnvioClick
          </span>
          <span className="text-[13px] text-primary/85">
            {reason ??
              "Pedido pagado. Al crearla, el cliente recibe el seguimiento."}
          </span>
          {guideError && (
            <span className="text-xs text-destructive">
              Último intento fallido: {guideError}
            </span>
          )}
        </div>
        <Button
          type="button"
          disabled={!ready || disabled || creating}
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          <Truck className="h-4 w-4" aria-hidden="true" />
          Crear guía · {currencyFormatter(cost)}
        </Button>
      </div>
      <span className="text-xs text-primary/70">
        Se cobra a EnvioClick y no se deshace desde aquí. Este es el único botón
        que la crea.
      </span>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Crear la guía de envío"
        from={{ label: "Sin guía", tone: "slate" }}
        to={{ label: "Guía creada", tone: "sky" }}
        meta={`${carrier} · ${currencyFormatter(cost)}`}
        consequences={[
          `Se pide la guía a EnvioClick con ${carrier} por ${currencyFormatter(cost)}: se cobra a la tienda.`,
          "No se deshace desde aquí; si hace falta, habrá que cancelar el envío con la transportadora.",
          "El cliente recibe el número de seguimiento.",
        ]}
        confirmLabel="Sí, crear la guía"
        loading={creating}
        onConfirm={create}
      />
    </div>
  );
}
