"use client";

import { createContext, ReactNode, useContext } from "react";

export interface StorefrontSettingsValue {
  freeShippingThreshold: number | null;
  /** Cuánto tarda en llegar un pedido; null si la dueña no lo ha configurado. */
  deliveryEstimate: string | null;
}

const StorefrontSettingsContext = createContext<StorefrontSettingsValue>({
  freeShippingThreshold: null,
  deliveryEstimate: null,
});

/** Ajustes públicos de la tienda leídos en el servidor y compartidos con los componentes de cliente. */
export function StorefrontSettingsProvider({
  value,
  children,
}: {
  value: StorefrontSettingsValue;
  children: ReactNode;
}) {
  return (
    <StorefrontSettingsContext.Provider value={value}>
      {children}
    </StorefrontSettingsContext.Provider>
  );
}

export function useStorefrontSettings() {
  return useContext(StorefrontSettingsContext);
}
