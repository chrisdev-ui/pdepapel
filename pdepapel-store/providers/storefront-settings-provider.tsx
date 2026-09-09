"use client";

import { createContext, ReactNode, useContext } from "react";

export interface StorefrontSettingsValue {
  freeShippingThreshold: number | null;
}

const StorefrontSettingsContext = createContext<StorefrontSettingsValue>({
  freeShippingThreshold: null,
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
