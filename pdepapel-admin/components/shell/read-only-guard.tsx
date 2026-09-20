"use client";

import axios from "axios";
import { useEffect } from "react";

import { useViewerAccess } from "@/components/shell/viewer-access";
import { useToast } from "@/hooks/use-toast";

const MUTATING = new Set(["post", "put", "patch", "delete"]);

/**
 * Red de seguridad del navegador: en una cuenta de solo lectura corta las
 * peticiones que escriben antes de salir, y explica por qué.
 *
 * **No es la seguridad.** El servidor rechaza cada escritura con
 * `requireStoreOwner` pase lo que pase aquí: esto solo evita que un botón que
 * se nos haya pasado por alto muestre un error críptico. Además cubre solo lo
 * que va por axios; las pantallas que escriben con `fetch` (Mercado Libre,
 * Envíos, Ajustes) quedan fuera, y son justo las que el menú ya esconde.
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
    return () => axios.interceptors.request.eject(id);
  }, [isViewer, toast]);

  return null;
}
