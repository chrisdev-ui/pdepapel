"use client";

import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BarcodeScannerProps = {
  onDetected: (code: string) => void;
  description?: string;
  label?: string;
};

function getCameraErrorMessage(cameraError: unknown) {
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
}: BarcodeScannerProps) {
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
        onDetectedRef.current(code);
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
      <Button
        type="button"
        variant="outline"
        onClick={() => void requestCamera()}
      >
        <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
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
