"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { StoreRole } from "@/lib/store-access";

/**
 * Qué puede hacer esta sesión en la tienda abierta. El rol lo decide el
 * servidor (`getStoreAccess` en el layout del panel) y aquí solo se reparte,
 * para que cada control sepa si debe estar activo.
 *
 * Esto es comodidad, no seguridad: cada escritura del servidor sigue
 * exigiendo `requireStoreOwner` pase lo que pase en el navegador.
 */
interface ViewerAccess {
  role: StoreRole | null;
  /** `false` en una cuenta de solo lectura: los controles que escriben se apagan. */
  canWrite: boolean;
  /** `true` solo en una cuenta de solo lectura (no en la dueña ni sin sesión). */
  isViewer: boolean;
}

const ViewerAccessContext = createContext<ViewerAccess>({
  role: null,
  canWrite: true,
  isViewer: false,
});

export function ViewerAccessProvider({
  role,
  children,
}: {
  role: StoreRole | null;
  children: ReactNode;
}) {
  const value = useMemo<ViewerAccess>(
    () => ({ role, canWrite: role !== "viewer", isViewer: role === "viewer" }),
    [role],
  );
  return <ViewerAccessContext.Provider value={value}>{children}</ViewerAccessContext.Provider>;
}

export function useViewerAccess(): ViewerAccess {
  return useContext(ViewerAccessContext);
}

/** `true` cuando la sesión puede escribir; `true` también fuera del panel. */
export function useCanWrite(): boolean {
  return useViewerAccess().canWrite;
}
