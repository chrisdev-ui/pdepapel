"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { createClsTracker, type LayoutShiftEntry } from "@/lib/cls-metric";
import { trackGoogleEvent } from "@/lib/customer-analytics";

/** Una de cada diez vistas de página manda su CLS. */
export const WEB_VITALS_SAMPLE_RATE = 0.1;
export const WEB_VITALS_CLS_EVENT = "web_vitals_cls";

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * La medición nunca puede tumbar la página: corre en el layout de todas las
 * rutas, y un error dentro de un efecto de React sube al error boundary
 * («Algo salió mal de nuestro lado»). Los navegadores integrados de Android
 * (Instagram, Facebook) inyectan un puente JS↔Java que lanza «Error invoking
 * postMessage: Java object is gone»; si lo hace dentro de una API del
 * navegador, cualquier llamada sin protección se lleva la tienda entera.
 * Todo lo que toca APIs del navegador va en try/catch y, si falla, la vista
 * simplemente no se mide.
 */
const safely = (run: () => void) => {
  try {
    run();
  } catch {
    // Sin medición para esta vista; la página sigue.
  }
};

/**
 * Mide el CLS de cada vista de página en una muestra del 10 % y lo manda a
 * GA4 como `web_vitals_cls`: el valor, la ruta (sin parámetros, para no llevar
 * búsquedas) y el selector del elemento que más se movió. Nada de la persona.
 * Solo sale con el consentimiento de analítica, como el resto de eventos.
 *
 * No toca el render: empieza después de hidratar, el observador recoge con
 * `buffered` lo que pasó antes, y el envío ocurre al ocultar la página o al
 * cambiar de ruta.
 */
export function WebVitalsReporter({ sampleRate = WEB_VITALS_SAMPLE_RATE }: { sampleRate?: number }) {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const trackerRef = useRef<ReturnType<typeof createClsTracker> | null>(null);
  const sampledRef = useRef(false);
  const sentRef = useRef(false);

  const flush = () =>
    safely(() => {
      const tracker = trackerRef.current;
      if (!tracker || !sampledRef.current || sentRef.current) return;
      sentRef.current = true;
      const { value, largestValue, largestTarget } = tracker.snapshot();
      trackGoogleEvent(WEB_VITALS_CLS_EVENT, {
        cls_value: round(value),
        cls_largest_value: round(largestValue),
        cls_largest_target: largestTarget || "(ninguno)",
        cls_page: pathRef.current ?? "",
      });
    });

  useEffect(() => {
    let observer: PerformanceObserver | null = null;
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const stop = () =>
      safely(() => {
        observer?.disconnect();
        document.removeEventListener("visibilitychange", onHidden);
        window.removeEventListener("pagehide", flush);
      });

    try {
      if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) return;
      // El sorteo es por vista de página; el observador corre siempre (es
      // barato) para que una vista sorteada más adelante tenga sus datos.
      sampledRef.current = Math.random() < sampleRate;

      const tracker = createClsTracker();
      trackerRef.current = tracker;
      observer = new PerformanceObserver((list) =>
        safely(() => {
          for (const entry of list.getEntries()) tracker.add(entry as unknown as LayoutShiftEntry);
        }),
      );
      observer.observe({ type: "layout-shift", buffered: true });

      document.addEventListener("visibilitychange", onHidden);
      window.addEventListener("pagehide", flush);
    } catch {
      // El navegador no deja observar: esta carga no se mide.
      trackerRef.current = null;
      stop();
      return;
    }
    return stop;
    // Una sola vez por carga; las rutas siguientes las maneja el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navegación dentro de la tienda: se manda la vista anterior y se vuelve a
  // sortear la siguiente, como una vista nueva.
  useEffect(() => {
    if (pathRef.current === pathname) return;
    flush();
    pathRef.current = pathname;
    safely(() => trackerRef.current?.reset());
    sentRef.current = false;
    sampledRef.current = Math.random() < sampleRate;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
