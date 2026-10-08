"use client";

import axios, { type InternalAxiosRequestConfig } from "axios";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { isPanelApi } from "@/components/shell/read-only-guard";
import { useViewerAccess } from "@/components/shell/viewer-access";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { BUILD_SHA, VERSION_POLL_MS, isNewVersionAvailable } from "@/lib/version-check";
import { guardMutation, holdForReload, useVersionGuard } from "@/lib/version-guard";

/** Volver a la pestaña varias veces seguidas no repite la consulta. */
const MIN_CHECK_GAP_MS = 30_000;

async function guardAxios(config: InternalAxiosRequestConfig) {
  if ((await guardMutation(config.method)) === "reload") return holdForReload();
  return config;
}

/**
 * Avisa cuando la pestaña quedó en una versión anterior del panel y, antes de
 * guardar, crear o borrar con ella, pregunta si recargar primero. Cubre las
 * tres formas de escribir del panel: axios, la instancia de `lib/api` y `fetch`.
 */
export function VersionGuard({ buildSha = BUILD_SHA }: { buildSha?: string }) {
  const { isViewer } = useViewerAccess();
  const stale = useVersionGuard((state) => state.stale);
  const prompt = useVersionGuard((state) => state.prompt);
  const answer = useVersionGuard((state) => state.answer);
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
        if (isNewVersionAvailable(buildSha, sha)) useVersionGuard.setState({ stale: true });
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
    // Una cuenta de solo lectura no escribe: no hay nada que preguntar.
    if (!buildSha || isViewer) return;
    const globalId = axios.interceptors.request.use(guardAxios);
    const apiId = api.interceptors.request.use(guardAxios);
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const method =
        init?.method ?? (typeof input === "object" && "method" in input ? input.method : undefined);
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (isPanelApi(url) && (await guardMutation(method)) === "reload") return holdForReload();
      return originalFetch(input, init);
    };
    return () => {
      axios.interceptors.request.eject(globalId);
      api.interceptors.request.eject(apiId);
      window.fetch = originalFetch;
    };
  }, [buildSha, isViewer]);

  return (
    <>
      {stale ? (
        <div
          role="status"
          className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-tint-cream bg-tint-cream px-4 py-2 text-sm text-primary sm:px-8"
        >
          <p className="font-medium">Hay una versión nueva del panel. Recarga para usarla</p>
          <Button size="sm" variant="outline" className="bg-white" onClick={() => reload()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Recargar
          </Button>
        </div>
      ) : null}
      <AlertDialog
        open={prompt !== null}
        onOpenChange={(open) => {
          // Cerrar con Escape no pierde nada: sigue como estaba.
          if (!open && useVersionGuard.getState().prompt) answer("continue");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay una versión nueva del panel</AlertDialogTitle>
            <AlertDialogDescription>
              Esta pestaña tiene una versión anterior. Si recargas, los cambios sin guardar de esta
              pantalla se pierden; los borradores de lo que estás creando se conservan. Si continúas,
              se guarda ahora con esta versión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => answer("continue")}>Continuar sin recargar</AlertDialogCancel>
            <AlertDialogAction onClick={() => answer("reload")}>Recargar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
