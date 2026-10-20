import { Gift, Sparkles } from "lucide-react";

import type { Order } from "@/types";

import { OrderSection } from "./order-section";

/**
 * El pack de cápsulas del pedido: qué se compró y, con el sorteo cerrado, lo
 * que salió. Sin cifras de lo que «vale» el contenido.
 */
export function OrderCapsuleCard({ capsule }: { capsule: NonNullable<Order["capsule"]> }) {
  // Lo repetido va una vez con su cantidad («Lápiz conejito × 4»); el regalo primero.
  const grouped = Array.from(
    capsule.products.reduce((map, product) => {
      const key = `${product.gift ? "1" : "0"}:${product.name}`;
      const row = map.get(key);
      map.set(key, { ...product, count: (row?.count ?? 0) + 1 });
      return map;
    }, new Map<string, { name: string; gift: boolean; count: number }>()).values(),
  ).sort((a, b) => Number(b.gift) - Number(a.gift));
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
            {grouped.map((product) => (
              <li key={`${product.gift}-${product.name}`} className="flex items-center gap-2 text-blue-yankees">
                {product.gift ? <Gift className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4 text-yellow-star" aria-hidden />}
                {product.name}
                {product.count > 1 ? ` × ${product.count}` : ""}
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
