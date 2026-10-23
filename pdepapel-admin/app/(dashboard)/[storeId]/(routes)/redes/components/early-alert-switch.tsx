"use client";

import axios from "axios";
import { useRef, useState } from "react";

import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { earlyAlertLine, type EarlyAlertStatus } from "@/lib/social/early-alert-rules";

/** Estado de la alerta temprana por red y el interruptor de emergencia (pausar / reanudar sin desplegar). */
export function EarlyAlertSwitch({ storeId, status, onChanged }: { storeId: string; status: EarlyAlertStatus; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const toggle = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await axios.put(`/api/${storeId}/social/early-alert`, { enabled: !status.switchOn });
      await onChanged();
      toast({ title: status.switchOn ? "Alerta temprana pausada" : "Alerta temprana reanudada" });
    } catch (error) {
      toast({ title: "No se pudo cambiar la alerta temprana", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <p className="min-w-0">{earlyAlertLine(status)}</p>
      <button
        type="button"
        role="switch"
        aria-checked={status.switchOn}
        aria-label="Alerta temprana"
        disabled={busy}
        onClick={toggle}
        className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-primary underline underline-offset-4 disabled:opacity-60"
      >
        {status.switchOn ? "Pausar" : "Reanudar"}
      </button>
    </div>
  );
}
