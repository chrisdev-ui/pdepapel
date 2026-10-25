import { cache } from "react";

import { CAPSULES_TAG, CATALOG_CACHE_REVALIDATE_SECONDS, withUpstreamTimeout } from "@/lib/catalog-cache";
import { publicEnv as env } from "@/lib/public-env";
import type { CurrentCapsuleEdition } from "@/types/capsules";

export type CurrentCapsuleState =
  /** La venta está apagada (el panel responde 404) o el panel no respondió. */
  | { salesEnabled: false; edition: null }
  | { salesEnabled: true; edition: CurrentCapsuleEdition | null };

const OFF: CurrentCapsuleState = { salesEnabled: false, edition: null };

/**
 * La edición LIVE de hoy. Va en el encabezado de todas las páginas: guardada
 * 5 minutos con la etiqueta `capsules` (nunca `no-store`, que volvería
 * dinámica toda la tienda). Cualquier fallo esconde el menú y el banner.
 */
export const getCurrentCapsuleEdition = cache(async (): Promise<CurrentCapsuleState> => {
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_API_URL}/capsulas/actual`,
      withUpstreamTimeout({ next: { revalidate: CATALOG_CACHE_REVALIDATE_SECONDS, tags: [CAPSULES_TAG] } }),
    );
    if (!response.ok) return OFF;
    const payload = (await response.json()) as { edition?: CurrentCapsuleEdition | null };
    return { salesEnabled: true, edition: payload.edition ?? null };
  } catch {
    return OFF;
  }
});

export const capsuleEditionPath = (edition: Pick<CurrentCapsuleEdition, "segment">) => `/capsulas/${edition.segment}`;
