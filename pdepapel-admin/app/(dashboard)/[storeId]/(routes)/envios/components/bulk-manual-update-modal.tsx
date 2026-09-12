"use client";

import { ShippingStatus } from "@prisma/client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { CLOSED_SHIPMENT_STATUSES, isShipmentTransitionAllowed } from "@/lib/shipment-status";
import { getShipmentStatusBadge } from "@/lib/shipment-views";

interface BulkManualUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALL_STATUSES = Object.values(ShippingStatus);
const label = (status: ShippingStatus) => getShipmentStatusBadge(status).label;

/**
 * Corrección de envíos manuales: de un estado concreto a otro, con el conteo
 * a la vista antes de confirmar. Los entregados y cancelados quedan fuera
 * salvo que se incluyan a propósito, y un salto fuera del flujo normal exige
 * marcarlo como corrección.
 */
export const BulkManualUpdateModal: React.FC<BulkManualUpdateModalProps> = ({ isOpen, onClose }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [fromStatus, setFromStatus] = useState<ShippingStatus | "">("");
  const [toStatus, setToStatus] = useState<ShippingStatus | "">("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [loading, setLoading] = useState(false);

  const endpoint = `/api/${params.storeId}/${Models.Shipments}/bulk-manual-update`;

  useEffect(() => {
    if (!isOpen) {
      setFromStatus("");
      setToStatus("");
      setIncludeClosed(false);
      setCorrection(false);
      setCount(null);
    }
  }, [isOpen]);

  const fromOptions = useMemo(
    () => ALL_STATUSES.filter((status) => includeClosed || !CLOSED_SHIPMENT_STATUSES.includes(status)),
    [includeClosed],
  );
  const toOptions = useMemo(
    () => ALL_STATUSES.filter((status) => status !== fromStatus && (correction || !fromStatus || isShipmentTransitionAllowed(fromStatus, status))),
    [fromStatus, correction],
  );
  const outOfFlow = Boolean(fromStatus && toStatus && !isShipmentTransitionAllowed(fromStatus, toStatus));

  // Conteo previo: cuántos envíos manuales están en el estado de origen.
  useEffect(() => {
    if (!isOpen || !fromStatus) {
      setCount(null);
      return;
    }
    let cancelled = false;
    setCounting(true);
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromStatus, toStatus: toStatus || (fromStatus === ShippingStatus.Preparing ? ShippingStatus.Shipped : ShippingStatus.Preparing), includeClosed, correction: true, dryRun: true }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!cancelled) setCount(response.ok ? Number(data.count ?? 0) : null);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      })
      .finally(() => {
        if (!cancelled) setCounting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, fromStatus, toStatus, includeClosed, endpoint]);

  const canConfirm = Boolean(fromStatus && toStatus) && !loading && !counting && (count ?? 0) > 0 && (!outOfFlow || correction);

  const onConfirm = async () => {
    if (!fromStatus || !toStatus) return;
    try {
      setLoading(true);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromStatus, toStatus, includeClosed, correction }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudieron corregir los envíos.");
      toast({
        title: `${data.updated} ${data.updated === 1 ? "envío corregido" : "envíos corregidos"}`,
        description: data.ordersUpdated > 0 ? `${data.ordersUpdated} ${data.ordersUpdated === 1 ? "pedido pasó" : "pedidos pasaron"} a «Enviado».` : undefined,
        variant: "success",
      });
      router.refresh();
      onClose();
    } catch (error) {
      toast({ title: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Corregir envíos manuales"
      description="Mueve los envíos manuales (domiciliario, mensajería sin rastreo) que están en un estado a otro. Verás cuántos son antes de confirmar."
      isOpen={isOpen}
      onClose={() => !loading && onClose()}
    >
      <div className="flex flex-col gap-4 py-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correccion-desde">Están en</Label>
            <Select disabled={loading} value={fromStatus} onValueChange={(value) => { setFromStatus(value as ShippingStatus); setToStatus(""); }}>
              <SelectTrigger id="correccion-desde" aria-label="Estado actual">
                <SelectValue placeholder="Estado actual" />
              </SelectTrigger>
              <SelectContent>
                {fromOptions.map((status) => (
                  <SelectItem key={status} value={status}>{label(status)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correccion-hacia">Pasan a</Label>
            <Select disabled={loading || !fromStatus} value={toStatus} onValueChange={(value) => setToStatus(value as ShippingStatus)}>
              <SelectTrigger id="correccion-hacia" aria-label="Estado nuevo">
                <SelectValue placeholder="Estado nuevo" />
              </SelectTrigger>
              <SelectContent>
                {toOptions.map((status) => (
                  <SelectItem key={status} value={status}>{label(status)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={includeClosed} onCheckedChange={(checked) => { setIncludeClosed(checked === true); setFromStatus(""); setToStatus(""); }} disabled={loading} aria-label="Incluir entregados y cancelados" className="mt-0.5" />
          <span>
            Incluir entregados y cancelados
            <span className="block text-xs text-muted-foreground">Normalmente no se tocan: son historial.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={correction} onCheckedChange={(checked) => setCorrection(checked === true)} disabled={loading} aria-label="Es una corrección" className="mt-0.5" />
          <span>
            Es una corrección
            <span className="block text-xs text-muted-foreground">Permite un salto fuera del flujo normal (por ejemplo, de «Entregado» a «Preparando»).</span>
          </span>
        </label>

        <p className="rounded-lg border bg-muted/40 p-3 text-sm" aria-live="polite">
          {!fromStatus
            ? "Elige el estado actual para ver cuántos envíos manuales hay."
            : counting
              ? "Contando…"
              : count === null
                ? "No se pudo contar. Inténtalo de nuevo."
                : count === 0
                  ? `No hay envíos manuales en «${label(fromStatus)}».`
                  : toStatus
                    ? `Se cambiarán ${count} ${count === 1 ? "envío manual" : "envíos manuales"} de «${label(fromStatus)}» a «${label(toStatus)}». El pedido de cada uno seguirá al envío.`
                    : `Hay ${count} ${count === 1 ? "envío manual" : "envíos manuales"} en «${label(fromStatus)}». Elige el estado nuevo.`}
          {outOfFlow && !correction && <span className="mt-1 block text-destructive">Ese salto no está en el flujo normal: márcalo como corrección para permitirlo.</span>}
        </p>

        <div className="flex w-full items-center justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button type="button" onClick={onConfirm} disabled={!canConfirm} isLoading={loading} loadingText="Corrigiendo…">
            {count && toStatus ? `Corregir ${count} ${count === 1 ? "envío" : "envíos"}` : "Corregir"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
