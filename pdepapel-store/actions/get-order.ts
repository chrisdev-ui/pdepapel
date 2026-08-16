import { env } from "@/lib/env.mjs";
import { UpstreamServiceError } from "@/lib/upstream-service-error";
import { Order } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/orders`;

export const getOrder = async (id: string): Promise<Order | null> => {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      cache: "no-store",
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
