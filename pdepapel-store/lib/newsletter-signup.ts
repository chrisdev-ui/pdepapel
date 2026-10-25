import { publicEnv as env } from "@/lib/public-env";

export const NEWSLETTER_CONFIRM_URL = `${env.NEXT_PUBLIC_API_URL}/newsletter/confirm`;

/**
 * El alta va directo del navegador al panel, como los pedidos: así el límite
 * por IP ve a la clienta y no al servidor de la tienda. `trap` son los campos
 * de `useBotTrap` (trampa, reloj y, con clave, el token de Turnstile).
 */
export function postNewsletterSignup(
  body: { email: string; consent: true; source?: string; productId?: string; company?: string },
  trap: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${env.NEXT_PUBLIC_API_URL}/newsletter/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ...trap }),
  });
}
