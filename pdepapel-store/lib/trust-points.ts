import { currencyFormatter } from "@/lib/utils";

export interface TrustPoint {
  title: string;
  description: string;
}

/** De dónde sale el pedido y hasta dónde llega, dicho igual en todas partes. */
export const NATIONWIDE_SHIPPING_COPY = "Desde Medellín enviamos a toda Colombia.";

/** Las tres promesas concretas de la tienda, en el hero y en la tienda. */
export function getTrustPoints(freeShippingThreshold: number | null): TrustPoint[] {
  return [
    {
      title: freeShippingThreshold
        ? `Envío gratis desde ${currencyFormatter.format(freeShippingThreshold)}`
        : "Envíos nacionales",
      description: NATIONWIDE_SHIPPING_COPY,
    },
    { title: "Pago en línea seguro", description: "Tarjeta, PSE, Nequi o transferencia." },
    { title: "Atención por WhatsApp", description: "Respondemos dudas y pedidos especiales." },
  ];
}
