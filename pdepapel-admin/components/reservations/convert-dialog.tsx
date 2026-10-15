"use client";

import axios from "axios";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { currencyFormatter } from "@/lib/utils";

type Preview = { lines: { productId: string; name: string; quantity: number; unitPrice: number; total: number }[]; subtotal: number; total: number; payment: string };

/**
 * «Convertir en pedido» con el resumen antes de confirmar: las líneas al
 * precio de hoy y el total que tendrá el pedido. Nada se crea hasta «Crear el
 * pedido».
 */
export function ConvertReservationDialog({
  open,
  onOpenChange,
  storeId,
  reservationId,
  customerName,
  onConverted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  reservationId: string;
  customerName: string;
  onConverted: (orderId: string) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setError(null);
    setLoading(true);
    axios
      .get(`/api/${storeId}/stock-reservations/${reservationId}/convert`)
      .then(({ data }) => !cancelled && setPreview(data))
      .catch((cause) => !cancelled && setError(axios.isAxiosError(cause) && typeof cause.response?.data?.error === "string" ? cause.response.data.error : "No pude armar el resumen. Intenta de nuevo."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, storeId, reservationId]);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await axios.post(`/api/${storeId}/stock-reservations/${reservationId}/convert`);
      onConverted(String(data.orderId));
    } catch (cause) {
      setError(axios.isAxiosError(cause) && typeof cause.response?.data?.error === "string" ? cause.response.data.error : "No se creó el pedido. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convertir en pedido</DialogTitle>
          <DialogDescription>
            Se crea un pedido pendiente para {customerName} con estos productos al precio de hoy. Las unidades siguen guardadas hasta que el pedido se pague o se cancele.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Armando el resumen…
          </p>
        ) : preview ? (
          <div className="flex flex-col gap-2 text-sm" data-testid="convert-summary">
            <ul className="divide-y rounded-md border">
              {preview.lines.map((line) => (
                <li key={line.productId} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 break-words">
                    {line.quantity} × {line.name}
                    <span className="block text-xs text-muted-foreground">{currencyFormatter(line.unitPrice)} c/u</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{currencyFormatter(line.total)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between font-semibold">
              <span>Total (sin envío)</span>
              <span className="tabular-nums">{currencyFormatter(preview.total)}</span>
            </p>
            <p className="text-xs text-muted-foreground">Pago: {preview.payment}. El correo, la dirección y el envío se completan en el pedido.</p>
          </div>
        ) : null}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" className="min-h-11" onClick={confirm} disabled={saving || loading || !preview}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Crear el pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
