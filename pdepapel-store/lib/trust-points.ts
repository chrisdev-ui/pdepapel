import { currencyFormatter } from "@/lib/utils";

export interface TrustPoint {
  title: string;
  description: string;
}

/** Las tres promesas concretas de la tienda, en el hero y en la tienda. */
export function getTrustPoints(freeShippingThreshold: number | null): TrustPoint[] {
  return [
    {
      title: freeShippingThreshold
        ? `Envío gratis desde ${currencyFormatter.format(freeShippingThreshold)}`
        : "Envíos nacionales",
      description: "Desde Medellín enviamos a toda Colombia.",
    },
    { title: "Pago en línea seguro", description: "Tarjeta, PSE, Nequi o transferencia." },
    { title: "Atención por WhatsApp", description: "Respondemos dudas y pedidos especiales." },
  ];
}
