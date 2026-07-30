import { InventoryMovementClient } from "./components/client";
import { InventoryMovementColumn } from "./components/columns";
import { getInventoryMovements } from "./server/get-movements";

import prismadb from "@/lib/prismadb";

export default async function InventoryMovementsPage({
  params,
}: {
  params: { storeId: string };
}) {
  const movements = await getInventoryMovements(params.storeId);
  const products = await prismadb.product.findMany({
    where: { storeId: params.storeId, isArchived: false },
    select: { id: true, name: true, stock: true },
    orderBy: { name: "asc" },
  });

  const formattedMovements: InventoryMovementColumn[] = movements;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <InventoryMovementClient
          data={formattedMovements}
          products={products}
        />
      </div>
    </div>
  );
}
