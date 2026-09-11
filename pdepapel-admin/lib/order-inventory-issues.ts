import { OrderInventoryIssueKind, Prisma, PrismaClient } from "@prisma/client";

import { ErrorFactory } from "./api-errors";
import { isFairIssueReference } from "./fair-issue-reference";
import { createInventoryMovement } from "./inventory";

type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface FailedInventoryLine {
  productId: string;
  quantity: number;
  productName: string;
  reason: string;
}

export {
  FAIR_ISSUE_PREFIX,
  formatFairIssueReference,
  isFairIssueReference,
} from "./fair-issue-reference";

/**
 * Deuda con el kardex: `createInventoryMovementBatchResilient` deja pasar la
 * transacción aunque alguna línea falle (stock insuficiente por una venta
 * cruzada, producto borrado). Antes eso solo quedaba en `console.error`, así
 * que un pedido llegaba a «Pagado» con inventario sin descontar y nadie lo
 * sabía. Ahora cada línea fallida queda como fila abierta del pedido, dentro
 * de la misma transacción, y el panel la muestra hasta que se reintenta o se
 * concilia a mano.
 */
export async function recordInventoryIssues(
  tx: PrismaTx,
  input: {
    storeId: string;
    /** Null para deuda que no pertenece a un pedido (cierre de feria). */
    orderId: string | null;
    orderNumber: string;
    kind: OrderInventoryIssueKind;
    failed: FailedInventoryLine[];
  },
): Promise<number> {
  if (input.failed.length === 0) return 0;
  // Un kit no tiene stock propio: su columna se deriva de los componentes y
  // `recalculateKitStock` la corrige después de cada movimiento. La línea del
  // kit "falla" cuando esa columna va atrasada, pero la deuda real está en
  // los componentes, que sí quedan registrados. Sin este filtro cada venta
  // de kit abriría una incidencia fantasma.
  const kits = await tx.product.findMany({
    where: {
      id: { in: input.failed.map((line) => line.productId) },
      isKit: true,
    },
    select: { id: true },
  });
  const kitIds = new Set(kits.map((kit) => kit.id));
  const failed = input.failed.filter((line) => !kitIds.has(line.productId));
  if (failed.length === 0) return 0;
  const created = await tx.orderInventoryIssue.createMany({
    data: failed.map((line) => ({
      storeId: input.storeId,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      kind: input.kind,
      productId: line.productId,
      productName: line.productName,
      quantity: Math.abs(line.quantity),
      reason: line.reason,
    })),
  });
  return created.count;
}

/**
 * Mismo helper para lotes (acciones masivas): cada movimiento intentado lleva
 * `referenceId` = pedido y su signo dice si descontaba o devolvía, así que la
 * línea fallida se atribuye al pedido correcto con el `kind` correcto.
 */
export async function recordInventoryIssuesForBatch(
  tx: PrismaTx,
  input: {
    storeId: string;
    attempted: { productId: string; quantity: number; referenceId?: string }[];
    failed: FailedInventoryLine[];
    orders: { id: string; orderNumber: string }[];
  },
): Promise<number> {
  if (input.failed.length === 0) return 0;
  const numberById = new Map(
    input.orders.map((order) => [order.id, order.orderNumber]),
  );
  const groups = new Map<string, FailedInventoryLine[]>();
  for (const line of input.failed) {
    const movement = input.attempted.find(
      (candidate) =>
        candidate.productId === line.productId &&
        candidate.quantity === line.quantity,
    );
    const orderId = movement?.referenceId;
    if (!orderId) continue;
    const kind =
      line.quantity < 0
        ? OrderInventoryIssueKind.DECREMENT
        : OrderInventoryIssueKind.RESTOCK;
    const key = `${orderId}|${kind}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  let total = 0;
  for (const [key, failed] of Array.from(groups.entries())) {
    const [orderId, kind] = key.split("|") as [string, OrderInventoryIssueKind];
    total += await recordInventoryIssues(tx, {
      storeId: input.storeId,
      orderId,
      orderNumber: numberById.get(orderId) ?? orderId,
      kind,
      failed,
    });
  }
  return total;
}

/**
 * Vuelve a intentar el movimiento que falló. Si el producto ya tiene stock
 * (o ya existe otra vez) el movimiento se crea con la misma referencia y la
 * fila queda resuelta apuntando a él; si vuelve a fallar, el error sube y la
 * fila sigue abierta.
 */
export async function retryOrderInventoryIssue(
  tx: PrismaTx,
  input: { issueId: string; storeId: string; resolvedBy: string },
) {
  const issue = await tx.orderInventoryIssue.findFirst({
    where: { id: input.issueId, storeId: input.storeId },
  });
  if (!issue)
    throw ErrorFactory.NotFound("La incidencia de inventario no existe");
  if (issue.resolvedAt) {
    throw ErrorFactory.InvalidRequest("Esta incidencia ya está resuelta");
  }
  const product = await tx.product.findFirst({
    where: { id: issue.productId, storeId: input.storeId },
    select: { acqPrice: true, price: true },
  });
  const decrement = issue.kind === OrderInventoryIssueKind.DECREMENT;
  const fromFair = issue.orderId === null && isFairIssueReference(issue.orderNumber);
  const movement = await createInventoryMovement(tx, {
    productId: issue.productId,
    storeId: input.storeId,
    type: fromFair
      ? "FESTIVAL_RETURN"
      : decrement
        ? "ORDER_PLACED"
        : "ORDER_CANCELLED",
    quantity: decrement ? -issue.quantity : issue.quantity,
    reason: fromFair
      ? `Reintento de devolución · ${issue.orderNumber}`
      : `Reintento de inventario · pedido #${issue.orderNumber}`,
    description: `Línea que falló al ${decrement ? "descontar" : "devolver"}: ${issue.reason}`,
    referenceId: issue.orderId ?? undefined,
    cost: Number(product?.acqPrice) || 0,
    price: Number(product?.price) || 0,
    createdBy: input.resolvedBy,
  });
  return tx.orderInventoryIssue.update({
    where: { id: issue.id },
    data: {
      resolvedAt: new Date(),
      resolvedBy: input.resolvedBy,
      movementId: movement?.id ?? null,
    },
  });
}

/** La administradora ya cuadró el inventario a mano (conteo físico): se cierra sin mover nada. */
export async function resolveOrderInventoryIssue(
  tx: PrismaTx,
  input: { issueId: string; storeId: string; resolvedBy: string },
) {
  const updated = await tx.orderInventoryIssue.updateMany({
    where: { id: input.issueId, storeId: input.storeId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedBy: input.resolvedBy },
  });
  if (updated.count === 0) {
    throw ErrorFactory.NotFound(
      "La incidencia de inventario no existe o ya está resuelta",
    );
  }
}

export const OPEN_INVENTORY_ISSUE_SELECT = {
  id: true,
  orderId: true,
  orderNumber: true,
  kind: true,
  productId: true,
  productName: true,
  quantity: true,
  reason: true,
  createdAt: true,
} as const;

export type OpenInventoryIssue = Prisma.OrderInventoryIssueGetPayload<{
  select: typeof OPEN_INVENTORY_ISSUE_SELECT;
}>;
