import { Gift, Sparkles } from "lucide-react";

import type { Order } from "@/types";

import { OrderSection } from "./order-section";

/**
 * El pack de cápsulas del pedido: qué se compró y, con el sorteo cerrado, lo
 * que salió. Sin cifras de lo que «vale» el contenido.
 */
export function OrderCapsuleCard({ capsule }: { capsule: NonNullable<Order["capsule"]> }) {
  return (
    <OrderSection id="pedido-capsulas" title="Tus cápsulas sorpresa" icon={Sparkles} tint="bg-kawaii-lavender-light">
      <p className="text-blue-yankees">
        Pack de {capsule.packSize} cápsulas · Edición #{capsule.editionNumber} {capsule.editionName}
        {capsule.giftLabel ? ` + ${capsule.giftLabel}` : ""}
      </p>
      {capsule.drawCompleted ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Ya abrimos tus cápsulas. Esto fue lo que salió:</p>
          <ul className="flex flex-col gap-1" data-testid="capsulas-que-salieron">
            {capsule.products.map((product, index) => (
              <li key={`${product.name}-${index}`} className="flex items-center gap-2 text-blue-yankees">
                {product.gift ? <Gift className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4 text-yellow-star" aria-hidden />}
                {product.name}
                {product.gift ? " (regalo)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Abriremos tus cápsulas, te contamos qué salió y te enviamos tus productos en una cajita.</p>
      )}
    </OrderSection>
  );
}
