import type { InventoryMovementType } from "@prisma/client";

import { FAIR_LINKED_TYPES, ORDER_LINKED_TYPES } from "@/lib/kardex";
import { collectMovementActorIds, movementActor, normalizeMovementActor } from "@/lib/movement-actor";
import prismadb from "@/lib/prismadb";

export { collectMovementActorIds, movementActor, normalizeMovementActor };

/**
 * De dónde viene un movimiento, resuelto a algo en lo que se pueda hacer clic.
 *
 * `InventoryMovement.referenceId` es un `String?` sin llave foránea que, según
 * el tipo, apunta a un pedido, a una orden de aprovisionamiento, a una feria o
 * a nada. Esta resolución vivía solo en el cargador del kardex; la lista
 * mostraba el texto crudo del motivo. Ahora las dos pantallas la comparten.
 */

export interface MovementReference {
  kind: "order" | "restock" | "fair" | "note";
  label: string;
  secondary: string | null;
  href: string | null;
}

export interface MovementReferenceInput {
  type: InventoryMovementType;
  referenceId: string | null;
  reason: string | null;
  description: string | null;
}

export interface MovementReferenceIndex {
  orders: Map<string, { id: string; orderNumber: string; fullName: string | null; city: string | null; userId: string | null; email: string | null }>;
  restockOrders: Map<string, { id: string; orderNumber: string; supplierName: string | null }>;
  fairs: Map<string, { id: string; name: string }>;
}

/** Una sola pasada por las tres tablas a las que puede apuntar `referenceId`. */
export async function loadMovementReferences(storeId: string, movements: MovementReferenceInput[]): Promise<MovementReferenceIndex> {
  const orderIds = new Set<string>();
  const restockIds = new Set<string>();
  const fairIds = new Set<string>();
  for (const movement of movements) {
    if (!movement.referenceId) continue;
    if (ORDER_LINKED_TYPES.has(movement.type)) orderIds.add(movement.referenceId);
    else if (movement.type === "RESTOCK_RECEIVED") restockIds.add(movement.referenceId);
    else if (FAIR_LINKED_TYPES.has(movement.type)) fairIds.add(movement.referenceId);
  }

  const [orders, restockOrders, fairs] = await Promise.all([
    orderIds.size > 0
      ? prismadb.order.findMany({
          where: { storeId, id: { in: Array.from(orderIds) } },
          select: { id: true, orderNumber: true, fullName: true, city: true, userId: true, email: true },
        })
      : Promise.resolve([]),
    restockIds.size > 0
      ? prismadb.restockOrder.findMany({
          where: { storeId, id: { in: Array.from(restockIds) } },
          select: { id: true, orderNumber: true, supplier: { select: { name: true } } },
        })
      : Promise.resolve([]),
    fairIds.size > 0
      ? prismadb.fairEvent.findMany({ where: { storeId, id: { in: Array.from(fairIds) } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return {
    orders: new Map(orders.map((order) => [order.id, order])),
    restockOrders: new Map(
      restockOrders.map((order) => [order.id, { id: order.id, orderNumber: order.orderNumber, supplierName: order.supplier?.name ?? null }]),
    ),
    fairs: new Map(fairs.map((fair) => [fair.id, fair])),
  };
}

const joinParts = (parts: (string | null | undefined)[]) => parts.filter((part) => Boolean(part?.trim())).join(" · ") || null;

/**
 * La referencia de una fila. Si el registro al que apuntaba se borró, o el
 * movimiento nunca tuvo referencia (los ajustes a mano no la tienen), queda la
 * razón escrita entre comillas: es lo único que explica la fila.
 */
export function buildMovementReference(
  movement: MovementReferenceInput,
  index: MovementReferenceIndex,
  storeId: string,
): MovementReference | null {
  if (movement.referenceId) {
    if (ORDER_LINKED_TYPES.has(movement.type)) {
      const order = index.orders.get(movement.referenceId);
      if (order) {
        return {
          kind: "order",
          label: order.orderNumber,
          secondary: joinParts([order.fullName, order.city]),
          href: `/${storeId}/pedidos/${order.id}`,
        };
      }
    } else if (movement.type === "RESTOCK_RECEIVED") {
      const restock = index.restockOrders.get(movement.referenceId);
      if (restock) {
        return {
          kind: "restock",
          label: restock.orderNumber,
          secondary: restock.supplierName,
          href: `/${storeId}/aprovisionamiento/${restock.id}`,
        };
      }
    } else if (FAIR_LINKED_TYPES.has(movement.type)) {
      const fair = index.fairs.get(movement.referenceId);
      if (fair) return { kind: "fair", label: fair.name, secondary: null, href: `/${storeId}/ferias/${fair.id}` };
    }
  }

  const label = movement.reason?.trim() || movement.description?.trim();
  if (!label) return null;
  const secondary =
    movement.reason?.trim() && movement.description?.trim() && movement.description.trim() !== movement.reason.trim()
      ? movement.description.trim()
      : null;
  return { kind: "note", label: `“${label}”`, secondary, href: null };
}
