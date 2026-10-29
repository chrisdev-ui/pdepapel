import { publicEnv as env } from "@/lib/public-env";

export type PreorderWaitlistSignup = {
  productId: string;
  name: string;
  phone?: string;
  email?: string;
  consentText: string;
  consentVersion: string;
};

/**
 * Alta en la lista de espera de una preventa. Va directo del navegador al
 * panel, como el boletín, para que el límite por IP vea a la clienta y no al
 * servidor de la tienda. `trap` son los campos de `useBotTrap`.
 */
export function postPreorderWaitlistSignup(body: PreorderWaitlistSignup, trap: Record<string, unknown>): Promise<Response> {
  return fetch(`${env.NEXT_PUBLIC_API_URL}/preorder-waitlist/public`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ...trap }),
  });
}
