import type { CreateInventoryMovementParams } from "@/lib/inventory";
import type { Prisma, PrismaClient } from "@prisma/client";

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
