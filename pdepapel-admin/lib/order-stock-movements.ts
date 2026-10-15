import { createInventoryMovementBatchResilient, type CreateInventoryMovementParams } from "@/lib/inventory";
import { recordInventoryIssues } from "@/lib/order-inventory-issues";
import { OrderInventoryIssueKind, type Prisma, type PrismaClient } from "@prisma/client";

type PrismaTx = Prisma.TransactionClient | PrismaClient;

/**
 * Un kit se vende como un producto pero se arma con componentes: cada
 * movimiento de un kit se acompaña del movimiento de sus componentes, en la
 * misma dirección (venta descuenta, cancelación devuelve). Así el libro de
 * inventario de los componentes cuadra sin importar qué ruta marcó el pedido
 * como pagado.
 */
export async function explodeKitMovements(
  tx: PrismaTx,
  movements: CreateInventoryMovementParams[],
  reasonSuffix = "",
): Promise<CreateInventoryMovementParams[]> {
  const productIds = Array.from(new Set(movements.map((m) => m.productId)));
  if (productIds.length === 0) return movements;

  const kits = await tx.product.findMany({
    where: { id: { in: productIds }, isKit: true },
    select: { id: true, name: true, kitComponents: { select: { componentId: true, quantity: true } } },
  });
  if (kits.length === 0) return movements;
  const kitMap = new Map(kits.map((kit) => [kit.id, kit]));

  const exploded: CreateInventoryMovementParams[] = [];
  for (const movement of movements) {
    exploded.push(movement);
    const kit = kitMap.get(movement.productId);
    if (!kit) continue;
    for (const component of kit.kitComponents) {
      exploded.push({
        ...movement,
        productId: component.componentId,
        quantity: movement.quantity * component.quantity,
        reason: `${movement.reason ?? ""} (Kit: ${kit.name})${reasonSuffix}`.trim(),
        cost: undefined,
        price: undefined,
      });
    }
  }
  return exploded;
}

/**
 * La mercancía de un pedido sale de bodega sin pasar por el PATCH del pedido:
 * un contra entrega que la transportadora recoge pasa de «Pendiente» a
 * «Enviado» desde el webhook o el rastreo. Descuenta como lo hace el PATCH
 * (kits incluidos, sin bloquear el envío si falta stock: la diferencia queda
 * como deuda de inventario). Devuelve los productos tocados.
 */
export async function deductStockForShippedOrder(
  tx: PrismaTx,
  order: { id: string; storeId: string; orderNumber: string },
): Promise<string[]> {
  const items = await tx.orderItem.findMany({
    where: { orderId: order.id, productId: { not: null } },
    select: { productId: true, quantity: true, price: true },
  });
  if (items.length === 0) return [];
  const products = await tx.product.findMany({
    where: { id: { in: items.map((item) => item.productId as string) } },
    select: { id: true, acqPrice: true },
  });
  const costs = new Map(products.map((product) => [product.id, Number(product.acqPrice) || 0]));

  const movements = await explodeKitMovements(
    tx,
    items.map((item) => ({
      productId: item.productId as string,
      storeId: order.storeId,
      type: "ORDER_PLACED" as const,
      quantity: -item.quantity,
      reason: `Orden Enviada #${order.orderNumber}`,
      referenceId: order.id,
      cost: costs.get(item.productId as string) ?? 0,
      price: Number(item.price),
      createdBy: "SYSTEM",
    })),
  );
  const result = await createInventoryMovementBatchResilient(tx, movements);
  if (result.failed.length > 0) {
    await recordInventoryIssues(tx, {
      storeId: order.storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      kind: OrderInventoryIssueKind.DECREMENT,
      failed: result.failed,
    });
  }
  return Array.from(new Set(movements.map((movement) => movement.productId)));
}
