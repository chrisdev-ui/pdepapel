"use client";

import axios from "axios";
import { useEffect } from "react";

import { useViewerAccess } from "@/components/shell/viewer-access";
import { useToast } from "@/hooks/use-toast";

const MUTATING = new Set(["post", "put", "patch", "delete"]);

/** `/api/...` de este mismo origen; nunca las rutas internas de Next. */
function isPanelApi(url: string): boolean {
  if (!url) return false;
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin && resolved.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

/**
 * Red de seguridad del navegador: en una cuenta de solo lectura corta las
 * peticiones que escriben antes de salir, y explica por qué.
 *
 * **No es la seguridad.** El servidor rechaza cada escritura con
 * `requireStoreOwner` pase lo que pase aquí: esto solo evita que un botón que
 * se nos haya pasado por alto muestre un error críptico.
 *
 * Cubre las dos formas de escribir del panel: axios y `fetch`. El aviso de
 * solo lectura promete que «los botones que crean, editan o borran están
 * apagados», y antes eso era mentira en Mercado Libre, Envíos y Ajustes, que
 * escriben con `fetch`. Solo se tocan las peticiones a `/api/`: las de Next
 * —navegación RSC y acciones de servidor— también van por `fetch` y tienen
 * que pasar intactas.
 */
export function ReadOnlyGuard() {
  const { isViewer } = useViewerAccess();
  const { toast } = useToast();

  useEffect(() => {
    if (!isViewer) return;
    const id = axios.interceptors.request.use((config) => {
      const method = (config.method ?? "get").toLowerCase();
      if (!MUTATING.has(method)) return config;
      toast({
        title: "Solo lectura",
        description: "Tu cuenta puede mirar el panel, pero no cambiar nada.",
        variant: "destructive",
      });
      return Promise.reject(
        Object.assign(new Error("Cuenta de solo lectura: no se envió el cambio."), {
          response: { status: 403, data: { error: "Tu cuenta es de solo lectura." } },
          readOnlyBlocked: true,
        }),
      );
    });
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const method = (
        init?.method ??
        (typeof input === "object" && "method" in input ? input.method : undefined) ??
        "GET"
      ).toLowerCase();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : "url" in input
              ? input.url
              : "";
      // Solo las escrituras de la API del panel. Lo de Next pasa tal cual.
      if (!MUTATING.has(method) || !isPanelApi(url)) {
        return originalFetch(input, init);
      }
      toast({
        title: "Solo lectura",
        description: "Tu cuenta puede mirar el panel, pero no cambiar nada.",
        variant: "destructive",
      });
      return new Response(JSON.stringify({ error: "Tu cuenta es de solo lectura." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    };

    return () => {
      axios.interceptors.request.eject(id);
      window.fetch = originalFetch;
    };
  }, [isViewer, toast]);

  return null;
}
