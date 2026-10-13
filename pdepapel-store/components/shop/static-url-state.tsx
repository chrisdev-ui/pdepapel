"use client";

import { NuqsAdapter } from "nuqs/adapters/react";
import { createContext, useContext, type ReactNode } from "react";

const StaticUrlStateContext = createContext(false);

/**
 * Estado de la URL para las copias en caché de /tienda y /categoria. El
 * adaptador de Next lee `useSearchParams`, y en una página estática eso hace
 * que todo el listado se pinte en el navegador (el HTML trae solo el
 * esqueleto). Este adaptador sirve la URL vacía en el servidor y la del
 * navegador después; los filtros siguen escribiendo en la URL igual.
 */
export function StaticUrlState({ children }: { children: ReactNode }) {
  return (
    <StaticUrlStateContext.Provider value={true}>
      <NuqsAdapter>{children}</NuqsAdapter>
    </StaticUrlStateContext.Provider>
  );
}

export const useIsStaticUrlState = () => useContext(StaticUrlStateContext);
