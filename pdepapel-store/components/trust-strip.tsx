import { MessageCircle, ShieldCheck, Truck } from "lucide-react";

import { getTrustPoints } from "@/lib/trust-points";

const ICONS = [Truck, ShieldCheck, MessageCircle];

/** Franja estática con las promesas de la tienda (sin carrusel). */
export function TrustStrip({ freeShippingThreshold = null }: { freeShippingThreshold?: number | null }) {
  const points = getTrustPoints(freeShippingThreshold);
  return (
    <section aria-label="Beneficios de comprar en P de Papel" className="border-b border-blue-baby/60 bg-kawaii-blue-light/30">
      <ul className="mx-auto grid max-w-screen-2xl grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-3 sm:gap-6 sm:px-6 lg:px-8">
        {points.map((point, index) => {
          const Icon = ICONS[index];
          return (
            <li key={point.title} className="flex min-w-0 items-center gap-3">
              <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-pink-froly" />
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-bold text-blue-yankees">{point.title}</p>
                <p className="truncate font-sans text-xs text-blue-yankees/70">{point.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default TrustStrip;
