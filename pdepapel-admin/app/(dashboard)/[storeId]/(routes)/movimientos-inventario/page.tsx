import { InventoryMovementClient } from "./components/client";
import { InventoryMovementColumn } from "./components/columns";
import { getInventoryMovements } from "./server/get-movements";

import { InventoryIssuesPanel } from "@/components/inventory/inventory-issues-panel";
import { OPEN_INVENTORY_ISSUE_SELECT } from "@/lib/order-inventory-issues";
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
  // Deuda con el kardex de cualquier pedido, incluidos los ya borrados: es el
  // único sitio donde una incidencia sin pedido sigue siendo visible.
  const openIssues = await prismadb.orderInventoryIssue.findMany({
    where: { storeId: params.storeId, resolvedAt: null },
    orderBy: { createdAt: "asc" },
    select: OPEN_INVENTORY_ISSUE_SELECT,
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <InventoryIssuesPanel
          storeId={params.storeId}
          issues={openIssues}
          showOrder
        />
        <InventoryMovementClient
          data={formattedMovements}
          products={products}
        />
      </div>
    </div>
  );
}
