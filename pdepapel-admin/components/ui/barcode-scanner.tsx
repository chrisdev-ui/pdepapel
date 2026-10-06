"use client";

import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { Camera, Loader2, RefreshCw, Smartphone, Volume2, VolumeX } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { RemoteScannerDialog } from "@/components/ui/remote-scanner-dialog";
import { useRemoteScanner } from "@/hooks/use-remote-scanner";
import { useScanFeedback } from "@/hooks/use-scan-feedback";
import { settleScan, type ScanOutcome, type ScanResult } from "@/lib/scan-outcome";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BarcodeScannerProps = {
  /**
   * Recibe el código leído. Si devuelve cómo le fue, el pitido lo respeta:
   * quien no devuelve nada se da por bueno (ver `lib/scan-outcome.ts`).
   */
  onDetected: (code: string) => ScanResult;
  description?: string;
  label?: string;
  /** Solo el icono en celular; el nombre sigue en `aria-label`. */
  compact?: boolean;
  className?: string;
  /** Ofrecer «Usar el celular como escáner» (necesita el storeId de la ruta). */
  remote?: boolean;
  /** `sm` iguala los botones pequeños de una cabecera de sección. */
  size?: "default" | "sm";
  /** Con un solo lector en pantalla, dice en texto que el celular vinculado recibe aquí. */
  remoteStatusLabel?: boolean;
  /** Tienda, cuando no se puede sacar de la ruta. Por defecto, la de la ruta. */
  storeId?: string;
  /**
   * Solo el icono en todos los tamaños: `label` queda únicamente como nombre
   * accesible (y `title`). Para varias líneas con su propio lector, donde el
   * texto largo «Escanear producto de la línea N» se comía la fila.
   */
  iconOnly?: boolean;
  /**
   * Qué botones pinta esta instancia:
   * - `all` (por defecto): cámara, sonido y celular vinculado.
   * - `camera`: solo la cámara. No se registra como destino del celular; el
   *   sonido y el celular los pone otra instancia `secondary` de la pantalla.
   * - `secondary`: solo sonido y celular vinculado, una vez por pantalla. Las
   *   lecturas del celular llegan a su `onDetected`.
   */
  controls?: "all" | "camera" | "secondary";
};

export function getCameraErrorMessage(cameraError: unknown) {
  if (cameraError instanceof DOMException) {
    if (cameraError.name === "NotAllowedError") {
      return "Permite el uso de la cámara en los permisos del navegador e inténtalo de nuevo.";
    }
    if (cameraError.name === "NotFoundError") {
      return "No encontramos una cámara disponible en este dispositivo.";
    }
    if (cameraError.name === "NotReadableError") {
      return "La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo.";
    }
  }

  return "No fue posible iniciar la cámara. Revisa el permiso e inténtalo de nuevo.";
}

export function BarcodeScanner({
  onDetected,
  description = "Apunta la cámara al código de barras o QR del producto.",
  label = "Escanear",
  compact = false,
  className,
  remote = true,
  size = "default",
  remoteStatusLabel = false,
  storeId: storeIdOverride,
  iconOnly = false,
  controls = "all",
}: BarcodeScannerProps) {
  const params = useParams();
  const showCamera = controls !== "secondary";
  const showSecondary = controls !== "camera";
  // Solo la cámara: no se registra en el celular vinculado, así las lecturas
  // van a la instancia `secondary` de la pantalla y no a la primera línea.
  const storeId = remote && showSecondary ? (storeIdOverride ?? String(params?.storeId ?? "")) : "";
  const [remoteOpen, setRemoteOpen] = useState(false);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [open, setOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null,
  );
  const [detectedCode, setDetectedCode] = useState<string | null>(null);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const { playSuccess, playReject, flash, muted, toggleMuted } = useScanFeedback();

  /**
   * Único punto donde suena el panel. La cámara local y el celular vinculado
   * pasan los dos por aquí, así que el aviso se escribe una vez y vale para
   * las once pantallas con lector. Suena después de saber cómo terminó, no al
   * leer: celebrar una unidad que no se agregó es peor que no sonar.
   */
  const handleCode = useCallback(
    async (code: string): Promise<ScanOutcome> => {
      const outcome = await settleScan(() => onDetectedRef.current(code));
      if (outcome.ok) playSuccess();
      else playReject();
      return outcome;
    },
    [playReject, playSuccess],
  );
  const handleCodeRef = useRef(handleCode);
  useEffect(() => {
    handleCodeRef.current = handleCode;
  }, [handleCode]);

  // El celular vinculado entrega por el mismo camino que la cámara local, y
  // devuelve el resultado para que la ventana de vinculación pueda nombrar el
  // producto en vez del código crudo.
  const remoteScanner = useRemoteScanner(storeId, (code) => handleCodeRef.current(code));
  const remotePaired = remoteScanner.status === "paired";

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);
    setIsStarting(false);
  }, []);

  const closeScanner = useCallback(() => {
    stopScanner();
    setOpen(false);
  }, [stopScanner]);

  const requestCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Este navegador no permite usar la cámara para escanear. Escribe el código o prueba con otro navegador.",
      );
      setOpen(true);
      return;
    }

    detectedRef.current = false;
    setDetectedCode(null);
    setError(null);
    setIsStarting(true);
    setOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setCameraStream(stream);
    } catch (cameraError) {
      setError(getCameraErrorMessage(cameraError));
      setIsStarting(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !cameraStream || !videoElement) return;

    const reader = new BrowserMultiFormatReader();
    let isActive = true;

    reader
      .decodeFromStream(cameraStream, videoElement, (result) => {
        if (!isActive || !result || detectedRef.current) return;

        detectedRef.current = true;
        const code = result.getText().trim();
        setDetectedCode(code);
        stopScanner();
        void handleCodeRef.current(code);
        // Deja ver «Código leído» un instante antes de cerrar.
        window.setTimeout(() => setOpen(false), 350);
      })
      .then((controls) => {
        controlsRef.current = controls;
        if (isActive) setIsStarting(false);
        else controls.stop();
      })
      .catch((scannerError) => {
        if (!isActive) return;
        setError(getCameraErrorMessage(scannerError));
        setIsStarting(false);
      });

    return () => {
      isActive = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [cameraStream, open, stopScanner, videoElement]);

  useEffect(
    () => () => {
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeScanner();
          return;
        }
        setOpen(true);
      }}
    >
      <div className={cn("flex min-w-0 items-center gap-1", className)}>
        {showCamera && (
          <Button
            type="button"
            variant="outline"
            size={iconOnly ? (size === "sm" ? "icon-sm" : "icon") : size === "sm" ? "sm" : "default"}
            aria-label={label}
            title={iconOnly ? label : undefined}
            data-scan-flash={flash ?? undefined}
            className={cn(
              size === "sm" ? undefined : "min-h-[2.5rem]",
              iconOnly && "shrink-0",
              // El destello acompaña al pitido para quien trabaja en silencio o
              // con ruido alrededor; dura lo mismo que el tono.
              "transition-colors duration-150",
              flash === "success" && "border-green-500 bg-green-50 text-green-800",
              flash === "reject" && "border-rose-400 bg-rose-50 text-rose-800",
            )}
            onClick={() => void requestCamera()}
          >
            <Camera className={iconOnly ? "h-4 w-4" : compact ? "h-4 w-4 sm:mr-2" : "mr-2 h-4 w-4"} aria-hidden="true" />
            {!iconOnly && <span className={compact ? "hidden sm:inline" : undefined}>{label}</span>}
          </Button>
        )}
        {showSecondary && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={muted ? "Activar el sonido al escanear" : "Silenciar el sonido al escanear"}
            aria-pressed={muted}
            title={muted ? "Sonido apagado · pulsa para activarlo" : "Suena al escanear · pulsa para silenciar"}
            className="shrink-0 text-muted-foreground"
            data-scan-mute={muted ? "on" : "off"}
            onClick={toggleMuted}
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
          </Button>
        )}
        {showSecondary && remoteScanner.enabled && (
          <Button
            type="button"
            variant="ghost"
            size={size === "sm" ? "icon-sm" : "icon"}
            aria-label={
              remotePaired
                ? remoteScanner.receiving
                  ? "Celular vinculado: recibe aquí"
                  : "Celular vinculado: recibir aquí"
                : "Usar el celular como escáner"
            }
            title={remotePaired ? (remoteScanner.receiving ? "Celular vinculado · recibe aquí" : "Celular vinculado · pulsa para recibir aquí") : "Usar el celular como escáner"}
            className="relative shrink-0"
            data-remote-scanner={remotePaired ? (remoteScanner.receiving ? "receiving" : "paired") : remoteScanner.status}
            onClick={() => {
              remoteScanner.claim();
              setRemoteOpen(true);
            }}
          >
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            {remotePaired && (
              <span
                className={cn("absolute right-1.5 top-1.5 h-2 w-2 rounded-full", remoteScanner.receiving ? "bg-green-600" : "bg-slate-400")}
                aria-hidden="true"
              />
            )}
          </Button>
        )}
        {remoteStatusLabel && remoteScanner.enabled && remotePaired && (
          <span
            className={cn(
              // En teléfono el chip quitaría espacio al buscador: queda el punto verde del botón del celular.
              "hidden h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold sm:inline-flex",
              remoteScanner.receiving ? "bg-tint-mint text-primary" : "bg-muted text-muted-foreground",
            )}
            data-remote-scanner-label={remoteScanner.receiving ? "receiving" : "paired"}
          >
            <span className={cn("h-2 w-2 rounded-full", remoteScanner.receiving ? "bg-green-600" : "bg-slate-400")} aria-hidden="true" />
            {remoteScanner.receiving ? "Celular vinculado · recibe aquí" : "Celular vinculado"}
          </span>
        )}
      </div>
      {remoteScanner.enabled && <RemoteScannerDialog open={remoteOpen} onOpenChange={setRemoteOpen} remote={remoteScanner} />}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear código</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          {cameraStream ? (
            <>
              <video
                ref={setVideoElement}
                className="h-full w-full object-cover"
                autoPlay
                muted
                playsInline
              />
              <div
                className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
                aria-hidden="true"
              />
              <p
                className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white drop-shadow"
                aria-live="polite"
              >
                {detectedCode
                  ? `Código leído: ${detectedCode}`
                  : isStarting
                    ? "Enfocando…"
                    : "Encuadra el código: se agrega solo al leerlo."}
              </p>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
              {isStarting ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                  <span>Solicitando acceso a la cámara…</span>
                </>
              ) : (
                <>
                  <Camera className="h-7 w-7" aria-hidden="true" />
                  <span>
                    {error
                      ? "Sin cámara por ahora. Puedes escribir el código en la casilla."
                      : "La vista de la cámara aparecerá aquí."}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        {isStarting && (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Iniciando cámara…
          </p>
        )}
        {error && (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void requestCamera()}
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Intentar de nuevo
              </Button>
              <Button type="button" variant="ghost" onClick={closeScanner}>
                Escribir el código
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
