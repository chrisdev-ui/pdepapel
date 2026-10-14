"use client";

import { RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { BUILD_SHA, VERSION_POLL_MS, isNewVersionAvailable } from "@/lib/version-check";
import { shouldReloadOnNavigation, useVersionGuard } from "@/lib/version-guard";

/** Volver a la pestaña varias veces seguidas no repite la consulta. */
const MIN_CHECK_GAP_MS = 30_000;

/**
 * Avisa cuando la pestaña quedó en una versión anterior del panel. No toca
 * ninguna petición: todo se guarda como siempre. Al pasar a otra pantalla la
 * página se carga entera (ya con la versión nueva), o antes si se toca
 * «Recargar». Cambiar filtros o la página de una lista no cuenta como pasar
 * de pantalla.
 */
export function VersionGuard({ buildSha = BUILD_SHA }: { buildSha?: string }) {
  const pathname = usePathname();
  // La pantalla actual según Next, la misma que compara el efecto de abajo.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const stale = useVersionGuard((state) => state.stale);
  const reload = useVersionGuard((state) => state.reload);

  useEffect(() => {
    if (!buildSha) return;
    let lastCheck = 0;
    const check = async () => {
      if (useVersionGuard.getState().stale) return;
      const now = Date.now();
      if (now - lastCheck < MIN_CHECK_GAP_MS) return;
      lastCheck = now;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const { sha } = (await response.json()) as { sha?: string | null };
        if (isNewVersionAvailable(buildSha, sha)) useVersionGuard.setState({ stale: true, staleAtPath: pathRef.current });
      } catch {
        // Sin red o sin respuesta no se sabe nada: no se avisa.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    const interval = window.setInterval(check, VERSION_POLL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [buildSha]);

  useEffect(() => {
    if (shouldReloadOnNavigation(useVersionGuard.getState(), pathname)) useVersionGuard.getState().reload();
  }, [pathname, stale]);

  if (!stale) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-tint-cream bg-tint-cream px-4 py-2 text-sm text-primary sm:px-8"
    >
      <p className="font-medium">Hay una versión nueva del panel. Se carga sola al cambiar de pantalla.</p>
      <Button size="sm" variant="outline" className="bg-white" onClick={() => reload()}>
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
        Recargar
      </Button>
    </div>
  );
}
