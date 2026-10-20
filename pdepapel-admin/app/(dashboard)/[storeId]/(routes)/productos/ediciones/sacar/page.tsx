import type { Metadata } from "next";

import { CapsuleQueue } from "./components/capsule-queue";
import { getCapsuleQueue } from "./server/get-capsule-queue";

export const metadata: Metadata = { title: "Sacar cápsulas" };

export default async function SacarCapsulasPage({ params }: { params: { storeId: string } }) {
  const { orders, boxes } = await getCapsuleQueue(params.storeId);
  return (
    <div className="flex flex-col gap-6 p-4 pt-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Sacar cápsulas</h1>
        <p className="text-sm text-muted-foreground">
          Abre un pedido pagado, saca sus papeles de la bolsa completa y escanea cada uno; elige el regalo, cierra y empaca en la caja sugerida. Después, su video.
        </p>
      </div>
      <CapsuleQueue orders={JSON.parse(JSON.stringify(orders))} boxes={boxes} />
    </div>
  );
}
