"use client";

import { Loader2, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TintBadge } from "@/components/ui/tint-badge";
import type { RemoteScanner } from "@/hooks/use-remote-scanner";
import { formatPairingCode, minutesLeft, relativeTime } from "@/lib/scanner-pairing";

interface RemoteScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remote: RemoteScanner;
}

/** Reloj de un segundo para «hace 12 s» y «vence en 9 min». */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * «Usar el celular como escáner»: el QR con el enlace, el código para
 * escribirlo a mano y los cuatro estados (esperando, vinculado, vencido,
 * desvinculado). Abrirla desde un botón hace que ese botón reciba.
 */
export function RemoteScannerDialog({ open, onOpenChange, remote }: RemoteScannerDialogProps) {
  const now = useNow(open);
  const { status, code, pairUrl, deviceLabel, pairedAt, expiresAt, lastScan, error } = remote;

  // Sin sesión al abrir: se genera el código de una vez.
  useEffect(() => {
    if (open && status === "idle") void remote.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-remote-scanner-dialog={status}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
            {status === "paired" ? "Celular vinculado" : status === "expired" ? "La vinculación venció" : status === "revoked" ? "Celular desvinculado" : "Vincular celular"}
          </DialogTitle>
          <DialogDescription>
            {status === "paired"
              ? "Lo que leas con el celular llega a esta pantalla como si fuera la cámara local."
              : status === "expired"
                ? "Pasaron 10 minutos sin actividad y el código ya no sirve."
                : status === "revoked"
                  ? "Esta pantalla dejó de recibir del celular."
                  : "Abre la cámara del celular y apunta a este código, o entra al enlace y escribe el código a mano. El celular tiene que tener tu misma sesión del panel."}
          </DialogDescription>
        </DialogHeader>

        {(status === "idle" || status === "creating") && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Generando el código…
          </p>
        )}

        {status === "error" && (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" onClick={() => void remote.start()}>
              Intentar de nuevo
            </Button>
          </div>
        )}

        {status === "waiting" && code && pairUrl && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border bg-white p-2" data-pairing-qr="">
              <QRCodeSVG value={pairUrl} size={180} level="M" includeMargin={false} />
            </div>
            <p className="rounded-md border border-dashed bg-muted/40 px-4 py-2 font-mono text-2xl font-bold tracking-[0.18em]" aria-label={`Código de vinculación ${code}`}>
              {formatPairingCode(code)}
            </p>
            <p className="break-all text-center text-xs text-muted-foreground">{pairUrl}</p>
            <p className="text-center text-xs text-muted-foreground" aria-live="polite">
              Esperando al celular · vale {expiresAt ? minutesLeft(expiresAt, now) : 10} min sin actividad · un celular a la vez.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void remote.stop();
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        )}

        {status === "paired" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-600" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-primary">{deviceLabel ?? "Celular"}</span>
                <span className="text-xs text-muted-foreground">
                  {pairedAt ? `Vinculado ${relativeTime(pairedAt, now)}` : "Vinculado"} · vence en {expiresAt ? minutesLeft(expiresAt, now) : 10} min sin leer nada
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Última lectura</span>
              {lastScan ? (
                <div className="rounded-lg border border-tint-lavender bg-tint-lavender/30 px-3 py-2 text-sm">
                  <span className="block truncate font-mono text-xs">{lastScan.code}</span>
                  <span className="text-xs text-muted-foreground">{relativeTime(lastScan.createdAt, now)}</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Todavía ninguna. Apunta el celular a un código.</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Cada lectura cae en el botón marcado como «recibe el celular». Si abres esta ventana desde otro botón, ese pasa a recibir.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                onClick={() => {
                  void remote.stop();
                  onOpenChange(false);
                }}
              >
                Desvincular
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}

        {(status === "expired" || status === "revoked") && (
          <div className="flex flex-col gap-3">
            <TintBadge tone={status === "expired" ? "cream" : "rose"} label={status === "expired" ? "Sin actividad por 10 minutos" : "Desvinculado"} className="self-start" />
            <p className="text-sm text-muted-foreground">
              {status === "expired"
                ? "El celular dejó de leer y el código ya no sirve. Genera otro código y vuelve a apuntar con la cámara."
                : "Genera otro código para vincular un celular de nuevo."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void remote.start()}>
                {status === "expired" ? "Generar otro código" : "Vincular de nuevo"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
