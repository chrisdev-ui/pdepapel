import { InventoryMovementClient } from "./components/client";
import { InventoryMovementColumn } from "./components/columns";
import { getInventoryMovements } from "./server/get-movements";

import { InventoryIssuesPanel } from "@/components/inventory/inventory-issues-panel";
import { OPEN_INVENTORY_ISSUE_SELECT } from "@/lib/order-inventory-issues";
import prismadb from "@/lib/prismadb";

export default async function InventoryMovementsPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams?: { referencia?: string; feria?: string };
}) {
  const referenceId = searchParams?.referencia?.trim() || null;
  const fairParam = searchParams?.feria;
  const fairId = fairParam?.trim() || null;
  // `?feria` sin valor (desde la lista de Ferias) abre el importador sin feria concreta.
  const openImporter = fairParam !== undefined;
  // Enlaces desde una feria: `referencia` filtra el kardex por sus
  // movimientos (reserva y devolución) y `feria` abre «Conciliar feria
  // anterior» con la feria como contexto.
  const [allMovements, referencedFair, contextFair] = await Promise.all([
    getInventoryMovements(params.storeId),
    referenceId
      ? prismadb.fairEvent.findFirst({
          where: { id: referenceId, storeId: params.storeId },
          select: { id: true, name: true },
        })
      : null,
    fairId
      ? prismadb.fairEvent.findFirst({
          where: { id: fairId, storeId: params.storeId },
          select: { id: true, name: true, status: true },
        })
      : null,
  ]);
  const movements = referenceId
    ? allMovements.filter((movement) => movement.referenceId === referenceId)
    : allMovements;
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
          reference={
            referenceId
              ? { id: referenceId, label: referencedFair?.name ?? null }
              : null
          }
          fairContext={contextFair}
          openImporter={openImporter}
        />
      </div>
    </div>
  );
}
