import { NextResponse } from "next/server";

import { getProduct } from "@/actions/get-product";
import { withSanitizedDescription } from "@/lib/product-description";
import { UpstreamServiceError } from "@/lib/upstream-service-error";

export const dynamic = "force-dynamic";

/**
 * Un producto para el navegador, con la descripción ya saneada.
 *
 * Al cambiar de variante en la ficha, el cliente pedía el producto directo al
 * administrador y saneaba la descripción él mismo, cargando `sanitize-html`
 * en la ruta con más visitas de la tienda. Ahora pasa por aquí: el saneado
 * ocurre en el servidor, con la misma función y la misma caché que usa la
 * página.
 */
export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const product = await getProduct(params.slug);
    if (!product) {
      return NextResponse.json({ error: "No encontramos este producto." }, { status: 404, headers });
    }
    return NextResponse.json(withSanitizedDescription(product), { headers });
  } catch (error) {
    const status = error instanceof UpstreamServiceError ? 503 : 500;
    return NextResponse.json({ error: "No pudimos cargar esta opción." }, { status, headers });
  }
}
