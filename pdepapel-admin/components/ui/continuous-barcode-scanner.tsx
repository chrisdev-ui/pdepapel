"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCameraErrorMessage } from "@/components/ui/barcode-scanner";
import { Button } from "@/components/ui/button";
import { useScanFeedback } from "@/hooks/use-scan-feedback";
import { cn } from "@/lib/utils";

/**
 * Ausencia que cuenta como «otra presentación» de la misma etiqueta.
 *
 * La cámara decodifica varias veces por segundo mientras la etiqueta esté en
 * el encuadre, así que no se puede aceptar la repetición sin más. Pero
 * apartar la etiqueta y volver a ponerla sí es una segunda lectura
 * deliberada, y eso es lo que hace Paula para sumar unidades. Entre dos
 * decodificaciones seguidas de la misma etiqueta pasan decenas de
 * milisegundos; entre apartar y volver, varios cientos. 350 ms cae con
 * holgura en medio: separa el gesto del parpadeo de la cámara.
 */
const SAME_CODE_GAP_MS = 350;

interface ContinuousBarcodeScannerProps {
  onDetected: (code: string) => void;
  /**
   * Tope para repetir el mismo código aunque nunca salga del encuadre.
   *
   * Antes eran 2500 ms fijos: para sumar tres unidades había que sostener la
   * etiqueta y esperar dos veces y media segundos sin ninguna señal de que la
   * cuenta hubiera subido, que es lo contrario de una pistola de supermercado.
   * Ahora el camino normal es el hueco de arriba —apartar y volver, y entra al
   * instante—, y este número solo limita el caso de dejar la etiqueta quieta
   * delante de la cámara.
   */
  repeatAfterMs?: number;
  active?: boolean;
}

/**
 * La cámara del celular vinculado: no se cierra al leer, sigue leyendo y
 * envía cada código nuevo. El mismo lector que el botón de escanear del panel.
 */
export function ContinuousBarcodeScanner({ onDetected, repeatAfterMs = 900, active = true }: ContinuousBarcodeScannerProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  /** Por código: cuándo se aceptó por última vez y cuándo se vio por última vez. */
  const recentRef = useRef<Map<string, { acceptedAt: number; seenAt: number }>>(new Map());
  const { playSuccess, flash } = useScanFeedback();
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
        const previous = recentRef.current.get(code);
        // Se apunta siempre que se ve, aunque se descarte: así se sabe si la
        // etiqueta estuvo ausente entre una lectura y la siguiente.
        recentRef.current.set(code, { acceptedAt: previous?.acceptedAt ?? 0, seenAt: now });
        if (previous) {
          const salioDelEncuadre = now - previous.seenAt >= SAME_CODE_GAP_MS;
          const pasoElTope = now - previous.acceptedAt >= repeatAfterMs;
          if (!salioDelEncuadre && !pasoElTope) return;
        }
        recentRef.current.set(code, { acceptedAt: now, seenAt: now });
        setLastCode(code);
        // Suena al leer, como un lector de mano: confirma la lectura, no el
        // viaje hasta la pantalla. Si el envío falla, la página avisa aparte.
        playSuccess();
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
  }, [stream, video, active, repeatAfterMs, playSuccess]);

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
            <div
              className={cn(
                "pointer-events-none absolute inset-7 rounded-2xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)] transition-colors duration-150",
                flash === "success" ? "border-green-400" : flash === "reject" ? "border-rose-400" : "border-white/85",
              )}
              aria-hidden="true"
            />
            {/* El visor entero parpadea: en la mano, a un brazo de distancia, el
                borde solo no se alcanza a ver. */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 transition-opacity duration-150",
                flash === "success" ? "bg-green-300/40 opacity-100" : flash === "reject" ? "bg-rose-400/40 opacity-100" : "opacity-0",
              )}
              data-scan-flash={flash ?? undefined}
              aria-hidden="true"
            />
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
