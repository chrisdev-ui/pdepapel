"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { canCreateGuide, isPaidLike as payableAsPaid } from "@/lib/order-transitions";
import { cn, currencyFormatter } from "@/lib/utils";
import type { OrderStatus } from "@prisma/client";
import axios from "axios";
import { Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import type { ShippingQuote } from "../schema";

const attemptFormat = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

interface GuidePanelProps {
  storeId: string;
  orderId: string;
  status: OrderStatus;
  isCOD: boolean;
  carrier: string;
  cost: number;
  /** La tarifa elegida es la que está guardada en el pedido. */
  saved: boolean;
  /** La tarifa elegida lleva más de dos horas. */
  stale: boolean;
  /** La tarifa de la última cotización, si está en pantalla (trae el recaudo). */
  rate?: ShippingQuote | null;
  guideError?: string | null;
  guideAttemptedAt?: string | Date | null;
  /** Cuándo llegó la última cotización: un fallo anterior ya no es noticia. */
  quotedAt?: Date | null;
  /** Guarda el pedido con la tarifa elegida antes de pedir la guía. */
  saveForGuide?: () => Promise<boolean>;
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
  rate = null,
  guideError,
  guideAttemptedAt = null,
  quotedAt = null,
  saveForGuide,
  disabled = false,
}: GuidePanelProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const payable = canCreateGuide(status, isCOD);
  const saveFirst = !saved && Boolean(saveForGuide);
  const reason =
    !saved && !saveForGuide
      ? "Guarda el pedido para poder crear la guía con esta tarifa."
      : stale
        ? "La tarifa lleva más de 2 h. Cotiza de nuevo y elige una tarifa."
        : !payable
          ? "Disponible cuando el pedido esté pagado (o sea contra entrega)."
          : null;
  const ready = reason === null;

  // Lo que cobra EnvioClick por la guía: flete + seguro y, contra entrega, el
  // recaudo. Lo que paga la clienta en el pedido sigue siendo `cost`.
  const codCost = isCOD && rate?.isCOD ? Number(rate.codCost ?? 0) : 0;
  const envioClickTotal = cost + codCost;
  const breakdown = rate
    ? `flete ${currencyFormatter(rate.flete)} + seguro ${currencyFormatter(rate.minimumInsurance)}${codCost ? ` + recaudo ${currencyFormatter(codCost)}` : ""}`
    : null;

  const attemptedAt = guideAttemptedAt ? new Date(guideAttemptedAt) : null;
  const errorIsOld = Boolean(attemptedAt && quotedAt && quotedAt.getTime() > attemptedAt.getTime());
  const showError = Boolean(guideError) && !errorIsOld;

  const create = async () => {
    setCreating(true);
    try {
      if (saveFirst && !(await saveForGuide!())) {
        setOpen(false);
        return;
      }
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
              (isCOD && !payableAsPaid(status)
                ? "Contra entrega: EnvioClick cobra al entregar. Al crearla, el cliente recibe el seguimiento."
                : "Pedido pagado. Al crearla, el cliente recibe el seguimiento.")}
          </span>
          <span className="text-[13px] font-semibold text-primary" data-testid="envioclick-total">
            Total que cobra EnvioClick: {currencyFormatter(envioClickTotal)}
            {breakdown ? ` (${breakdown})` : isCOD ? " (más el recaudo; cotiza de nuevo para verlo)" : ""}
          </span>
          {showError && (
            <span className="text-xs text-destructive" data-testid="guide-error">
              Último intento fallido
              {attemptedAt ? ` (${attemptFormat.format(attemptedAt)})` : ""}: {guideError}
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
          {saveFirst ? "Guardar y crear guía" : "Crear guía"} · {currencyFormatter(envioClickTotal)}
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
        meta={`${carrier} · ${currencyFormatter(envioClickTotal)}`}
        consequences={[
          ...(saveFirst ? ["Primero se guarda el pedido con esta tarifa."] : []),
          `Se pide la guía a EnvioClick con ${carrier} por ${currencyFormatter(envioClickTotal)}${breakdown ? ` (${breakdown})` : ""}: se cobra a la tienda.`,
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
