import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { getCurrentCapsuleEdition } from "@/lib/capsule-public";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * La edición LIVE de la tienda (lectura pública). 404 con la venta apagada;
 * `{ edition: null }` sin edición a la venta. La tienda la guarda 5 minutos
 * con la etiqueta `capsules`, que el panel purga al abrir o cerrar una edición.
 */
export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  try {
    const edition = await getCurrentCapsuleEdition({ storeId: params.storeId });
    if (edition === undefined) return NextResponse.json({ error: "Venta de cápsulas apagada" }, { status: 404, headers: { ...CACHE_HEADERS.NO_CACHE, "X-Robots-Tag": "noindex" } });
    return NextResponse.json({ edition }, { headers: { ...CACHE_HEADERS.NO_CACHE, "X-Robots-Tag": "noindex" } });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_CURRENT_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
