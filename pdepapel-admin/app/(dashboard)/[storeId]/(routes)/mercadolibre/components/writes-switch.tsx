"use client";

import { PauseCircle, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ActionConfirmationDialog } from "@/components/modals/action-confirmation-dialog";
import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

import { TintBadge } from "../../pedidos/components/order-badges";

export type MercadoLibreWritesState = { paused: boolean; pausedAt: string | null };

const DATE_TIME = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

const PAUSE_DESCRIPTION =
  "Solo saldrán las bajadas de stock (y la pausa de lo que quede en cero), para que Mercado Libre no venda de más. Esperan: subidas de stock, precios, activar, publicaciones nuevas, fotos, descripciones, condiciones de venta y publicidad; salen al reanudar. Responder preguntas sigue funcionando.";

export function MercadoLibreWritesPausedBanner({ state }: { state: MercadoLibreWritesState }) {
  if (!state.paused) return null;
  return (
    <div role="status" data-testid="mercadolibre-writes-paused-banner" className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-primary">
      <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p>
        <strong>Escrituras a Mercado Libre pausadas</strong>
        {state.pausedAt ? ` (desde ${DATE_TIME.format(new Date(state.pausedAt))})` : ""}: no se envían precios, subidas de stock, fotos ni publicaciones. Lo pendiente sale al
        reanudar desde Resumen. Las bajadas de stock sí salen.
      </p>
    </div>
  );
}

export function MercadoLibreWritesSwitchCard({ storeId, state }: { storeId: string; state: MercadoLibreWritesState }) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const next = !state.paused;

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/${storeId}/marketplaces/mercadolibre/writes-switch`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; released?: number };
      if (!response.ok) throw new Error(body.error ?? "No se pudo cambiar el interruptor");
      toast({
        variant: "success",
        description: next
          ? "Escrituras a Mercado Libre pausadas"
          : body.released
            ? `Escrituras reanudadas: ${body.released} ${body.released === 1 ? "cambio pendiente sale" : "cambios pendientes salen"} ahora`
            : "Escrituras a Mercado Libre reanudadas",
      });
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast({ variant: "destructive", title: "No se pudo cambiar", description: error instanceof Error ? error.message : "Inténtalo de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="mercadolibre-writes-switch" className={state.paused ? "border-destructive/50" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {state.paused ? (
              <PauseCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
            ) : (
              <PlayCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
            Escrituras a Mercado Libre
          </CardTitle>
          <TintBadge label={state.paused ? "Pausadas" : "Activas"} tone={state.paused ? "pink" : "mint"} />
        </div>
        <CardDescription>Interruptor de emergencia: frena todo lo que el panel envía a Mercado Libre, sin desconectar la cuenta.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {state.paused
            ? "Solo salen las bajadas de stock. Lo demás espera; las ventas y las preguntas siguen llegando al panel."
            : "Publicar, precios, stock, fotos y descripciones salen normalmente."}
        </p>
        <Button
          type="button"
          className="min-h-11 shrink-0"
          variant={state.paused ? "default" : "outline"}
          disabled={!canWrite}
          title={canWrite ? undefined : "Solo lectura"}
          onClick={() => setConfirming(true)}
        >
          {state.paused ? "Reanudar escrituras" : "Pausar escrituras"}
        </Button>
      </CardContent>
      <ActionConfirmationDialog
        isOpen={confirming}
        onOpenChange={(open) => !saving && setConfirming(open)}
        onConfirm={() => void save()}
        title={next ? "¿Pausar las escrituras a Mercado Libre?" : "¿Reanudar las escrituras a Mercado Libre?"}
        description={next ? PAUSE_DESCRIPTION : "Lo que quedó esperando (stock, precios, fotos) sale ahora con su última cifra."}
        confirmLabel={next ? "Pausar escrituras" : "Reanudar"}
        destructive={next}
      />
    </Card>
  );
}
