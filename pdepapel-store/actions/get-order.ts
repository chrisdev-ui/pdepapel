import { env } from "@/lib/env.mjs";
import { UpstreamServiceError } from "@/lib/upstream-service-error";
import { Order } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/orders`;

/**
 * Pedido por id. Un pedido de invitada se abre con el enlace; uno de una
 * clienta con cuenta solo se abre con su sesión (o la de la dueña), así que
 * la página manda el token de Clerk cuando lo hay y la API responde 404 si
 * no corresponde.
 */
export const getOrder = async (
  id: string,
  sessionToken?: string | null,
): Promise<Order | null> => {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      cache: "no-store",
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new UpstreamServiceError("tu pedido", response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof UpstreamServiceError) throw error;
    throw new UpstreamServiceError("tu pedido");
  }
};
