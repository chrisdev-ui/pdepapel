import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { getPublicCapsuleEdition } from "@/lib/capsule-public";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * Una edición de cápsulas para la tienda (lectura pública, sin sesión). Con
 * la venta apagada responde 404 salvo con el enlace de vista previa
 * (`?vista=`). Sin caché: los cupos del día cambian y una vista previa no se
 * puede guardar para otros.
 */
export async function GET(req: Request, { params }: { params: { storeId: string; edicion: string } }) {
  try {
    const token = new URL(req.url).searchParams.get("vista");
    const edition = await getPublicCapsuleEdition({ storeId: params.storeId, segment: params.edicion, token });
    if (!edition) return NextResponse.json({ error: "Edición no encontrada" }, { status: 404, headers: { ...CACHE_HEADERS.NO_CACHE, "X-Robots-Tag": "noindex" } });
    return NextResponse.json(edition, { headers: { ...CACHE_HEADERS.NO_CACHE, "X-Robots-Tag": "noindex" } });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_PUBLIC_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
