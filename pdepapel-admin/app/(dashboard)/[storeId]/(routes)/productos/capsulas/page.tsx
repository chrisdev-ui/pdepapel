import type { Metadata } from "next";

import { CapsulePacker } from "./components/capsule-packer";
import { getCapsuleWorkspace } from "./server/get-capsule-workspace";

export const metadata: Metadata = { title: "Empacar cápsulas" };

export default async function CapsulasPage({
  params,
}: {
  params: { storeId: string };
}) {
  const { capsuleProducts, sourceProducts, batches } = await getCapsuleWorkspace(
    params.storeId,
  );

  return (
    <div className="flex flex-col gap-6 p-4 pt-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Empacar cápsulas
        </h1>
        <p className="text-sm text-muted-foreground">
          Las unidades que metas salen de bodega y entran como cápsulas. La
          cápsula se vende como cualquier otro producto: en el punto de venta,
          en la tienda en línea y en una feria.
        </p>
      </div>
      <CapsulePacker
        capsuleProducts={capsuleProducts}
        sourceProducts={sourceProducts}
        batches={batches}
      />
    </div>
  );
}
