import { InventoryMovementClient } from "./components/client";
import { getInventoryMovements } from "./server/get-movements";

import { InventoryIssuesPanel } from "@/components/inventory/inventory-issues-panel";
import { OPEN_INVENTORY_ISSUE_SELECT } from "@/lib/order-inventory-issues";
import prismadb from "@/lib/prismadb";

export const revalidate = 0;
export const maxDuration = 60;

interface InventoryMovementsPageProps {
  params: { storeId: string };
  searchParams?: {
    /** `referenceId` de una feria, pedido u orden de aprovisionamiento: sin ventana ni tope. */
    referencia?: string;
    /** Solo los movimientos de un producto. */
    producto?: string;
    /** `feria` (con o sin valor) abre «Conciliar feria anterior». */
    feria?: string;
    /** `todo=1` levanta la ventana de 90 días (queda el tope de 2.000). */
    todo?: string;
  };
}

export default async function InventoryMovementsPage({ params, searchParams }: InventoryMovementsPageProps) {
  const referenceId = searchParams?.referencia?.trim() || null;
  const productId = searchParams?.producto?.trim() || null;
  const fairParam = searchParams?.feria;
  const fairId = fairParam?.trim() || null;
  const showAll = searchParams?.todo === "1";
  // `?feria` sin valor (desde la lista de Ferias) abre el importador sin feria concreta.
  const openImporter = fairParam !== undefined;
  // Enlaces desde una feria: `referencia` filtra el kardex por sus
  // movimientos (reserva y devolución) y `feria` abre «Conciliar feria
  // anterior» con la feria como contexto.
  const [result, referencedFair, referencedRestockOrder, contextFair, product, products, openIssues] = await Promise.all([
    getInventoryMovements(params.storeId, { referenceId, productId, sinceDays: showAll ? null : undefined }),
    referenceId
      ? prismadb.fairEvent.findFirst({ where: { id: referenceId, storeId: params.storeId }, select: { id: true, name: true } })
      : null,
    referenceId
      ? prismadb.restockOrder.findFirst({ where: { id: referenceId, storeId: params.storeId }, select: { id: true, orderNumber: true } })
      : null,
    fairId
      ? prismadb.fairEvent.findFirst({ where: { id: fairId, storeId: params.storeId }, select: { id: true, name: true, status: true } })
      : null,
    productId
      ? prismadb.product.findFirst({ where: { id: productId, storeId: params.storeId }, select: { id: true, name: true } })
      : null,
    prismadb.product.findMany({
      where: { storeId: params.storeId, isArchived: false },
      select: { id: true, name: true, stock: true },
      orderBy: { name: "asc" },
    }),
    // Deuda con el kardex de cualquier pedido, incluidos los ya borrados: es el
    // único sitio donde una incidencia sin pedido sigue siendo visible.
    prismadb.orderInventoryIssue.findMany({
      where: { storeId: params.storeId, resolvedAt: null },
      orderBy: { createdAt: "asc" },
      select: OPEN_INVENTORY_ISSUE_SELECT,
    }),
  ]);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <InventoryIssuesPanel storeId={params.storeId} issues={openIssues} showOrder />
        <InventoryMovementClient
          data={result.movements}
          products={products}
          scope={{ days: result.windowDays, hasMore: result.hasMore, take: result.take ?? null, showAll }}
          reference={
            referenceId
              ? {
                  id: referenceId,
                  label: referencedFair?.name ?? (referencedRestockOrder ? `Pedido ${referencedRestockOrder.orderNumber}` : null),
                }
              : null
          }
          product={productId ? { id: productId, name: product?.name ?? null } : null}
          fairContext={contextFair}
          openImporter={openImporter}
        />
      </div>
    </div>
  );
}
