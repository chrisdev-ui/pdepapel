"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCameraErrorMessage } from "@/components/ui/barcode-scanner";
import { Button } from "@/components/ui/button";

interface ContinuousBarcodeScannerProps {
  onDetected: (code: string) => void;
  /** No repetir el mismo código antes de este tiempo (el celular se queda apuntando). */
  repeatAfterMs?: number;
  active?: boolean;
}

/**
 * La cámara del celular vinculado: no se cierra al leer, sigue leyendo y
 * envía cada código nuevo. El mismo lector que el botón de escanear del panel.
 */
export function ContinuousBarcodeScanner({ onDetected, repeatAfterMs = 2500, active = true }: ContinuousBarcodeScannerProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const recentRef = useRef<Map<string, number>>(new Map());
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite usar la cámara. Prueba con Safari o Chrome.");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(media);
    } catch (cameraError) {
      setError(getCameraErrorMessage(cameraError));
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    if (!stream || !video || !active) return;
    const reader = new BrowserMultiFormatReader();
    let alive = true;
    reader
      .decodeFromStream(stream, video, (result) => {
        if (!alive || !result) return;
        const code = result.getText().trim();
        if (!code) return;
        const now = Date.now();
        const last = recentRef.current.get(code) ?? 0;
        if (now - last < repeatAfterMs) return;
        recentRef.current.set(code, now);
        setLastCode(code);
        onDetectedRef.current(code);
      })
      .then((controls) => {
        controlsRef.current = controls;
        if (alive) setStarting(false);
        else controls.stop();
      })
      .catch((scanError) => {
        if (!alive) return;
        setError(getCameraErrorMessage(scanError));
        setStarting(false);
      });
    return () => {
      alive = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [stream, video, active, repeatAfterMs]);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-900">
        {stream ? (
          <>
            <video ref={setVideo} className="h-full w-full object-cover" autoPlay muted playsInline />
            <div className="pointer-events-none absolute inset-7 rounded-2xl border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]" aria-hidden="true" />
            <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-semibold text-white drop-shadow" aria-live="polite">
              {lastCode ? `Leído: ${lastCode}` : starting ? "Enfocando…" : "Encuadra el código: se envía solo al leerlo."}
            </p>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-200">
            {starting ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                <span>Solicitando acceso a la cámara…</span>
              </>
            ) : (
              <>
                <Camera className="h-7 w-7" aria-hidden="true" />
                <span>{error ?? "Toca «Iniciar cámara» para empezar a leer."}</span>
              </>
            )}
          </div>
        )}
      </div>
      {!stream && (
        <Button type="button" size="lg" className="w-full" onClick={() => void start()} disabled={starting}>
          <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
          {error ? "Intentar de nuevo" : "Iniciar cámara"}
        </Button>
      )}
    </div>
  );
}
