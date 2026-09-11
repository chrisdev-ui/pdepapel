import axios from "axios";

import { env } from "@/lib/env.mjs";
import { Review } from "@/types";

/**
 * La reseña de la clienta con sesión para un producto, o `null`. Las reseñas
 * públicas ya no llevan el id de la autora, así que el formulario pregunta
 * con el token de sesión antes de decidir entre publicar y actualizar.
 */
export async function getMyReview(
  productId: string,
  sessionToken: string,
): Promise<Review | null> {
  const response = await axios.get<{ review: Review | null }>(
    `${env.NEXT_PUBLIC_API_URL}/products/${productId}/reviews/mine`,
    { headers: { Authorization: `Bearer ${sessionToken}` } },
  );
  return response.data.review ?? null;
}
