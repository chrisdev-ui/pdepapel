import { cache } from "react";

import { withUpstreamTimeout } from "@/lib/catalog-cache";
import { publicEnv as env } from "@/lib/public-env";
import { UpstreamServiceError } from "@/lib/upstream-service-error";
import type { CapsuleEditionPublic } from "@/types/capsules";

/**
 * Una edición de cápsulas para la tienda. Sin caché: los cupos del día
 * cambian y una vista previa (con `vista`) no se puede guardar para otros.
 * 404 (venta apagada sin enlace, edición cerrada o inexistente): null.
 * `cache` la pide una sola vez por petición (metadatos y página).
 */
export const getCapsuleEdition = cache(async (segment: string, previewToken?: string | null): Promise<CapsuleEditionPublic | null> => {
  const url = new URL(`${env.NEXT_PUBLIC_API_URL}/capsulas/${encodeURIComponent(segment)}`);
  if (previewToken) url.searchParams.set("vista", previewToken);
  let response: Response;
  try {
    response = await fetch(url, withUpstreamTimeout({ cache: "no-store" }));
  } catch {
    throw new UpstreamServiceError("las cápsulas");
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new UpstreamServiceError("las cápsulas", response.status);
  return (await response.json()) as CapsuleEditionPublic;
});
