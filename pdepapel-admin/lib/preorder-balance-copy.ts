import { currencyFormatter } from "@/lib/utils";

const STORE_URL = process.env.NEXT_PUBLIC_FRONTEND_STORE_URL || "https://papeleriapdepapel.com";

export const customerOrderUrl = (orderId: string) => `${STORE_URL}/pedido/${orderId}`;

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? "";

/** El mensaje que Paula copia en «Cobrar saldo» para mandarlo por WhatsApp. */
export function balanceWhatsAppMessage({ fullName, productName, amount, link, pickup = false }: { fullName: string; productName: string; amount: number; link: string; pickup?: boolean }) {
  const name = firstName(fullName);
  return `Hola${name ? ` ${name}` : ""}, ¡ya llegó tu ${productName}! Tu saldo es ${currencyFormatter(amount)}${pickup ? " y lo recoges en la tienda" : ", con el envío incluido"}. Puedes pagarlo aquí, en línea o por transferencia: ${link}`;
}
