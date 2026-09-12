import { CAPSULAS_SORPRESA_ID } from "@/constants";
import prismadb from "@/lib/prismadb";
import { resolveLowStockThreshold } from "@/lib/product-readiness";
import { computeReplenishment, limitingKitComponent, type ReplenishmentSignal } from "@/lib/replenishment";
import { getReplenishmentContext } from "@/lib/replenishment-db";

/**
 * Lista de Inventario con la señal de reposición por producto: ventas de 30 y
 * 90 días, cobertura, unidades en camino, sugerido y último costo de compra.
 * Los kits toman su stock del componente más escaso.
 */
export async function getInventory(storeId: string, now = new Date()) {
  const [products, store, context] = await Promise.all([
    prismadb.product.findMany({
      where: { storeId, isArchived: false, categoryId: { not: CAPSULAS_SORPRESA_ID } },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        price: true,
        acqPrice: true,
        isKit: true,
        updatedAt: true,
        category: { select: { name: true } },
        supplier: { select: { id: true, name: true } },
        images: { select: { url: true, isMain: true }, take: 1, orderBy: { isMain: "desc" } },
        kitComponents: { select: { quantity: true, component: { select: { id: true, name: true, stock: true } } } },
        inventoryMovements: { select: { createdAt: true, type: true, quantity: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { stock: "asc" },
    }),
    prismadb.store.findUnique({ where: { id: storeId }, select: { lowStockThreshold: true } }),
    getReplenishmentContext(storeId, now),
  ]);
  const threshold = resolveLowStockThreshold(store);

  return products.map((product) => {
    let stock = product.stock;
    let limiting: { name: string; kits: number } | null = null;
    if (product.isKit && product.kitComponents.length > 0) {
      const components = product.kitComponents.map((c) => ({ name: c.component.name, quantity: c.quantity, stock: c.component.stock }));
      limiting = limitingKitComponent(components);
      stock = Math.max(0, limiting?.kits ?? 0);
    }
    const sold30 = context.sold30.get(product.id) ?? 0;
    const sold90 = context.sold90.get(product.id) ?? 0;
    const onOrder = context.onOrder.get(product.id) ?? 0;
    const lastPurchase = context.lastPurchase.get(product.id) ?? null;
    const signal: ReplenishmentSignal = computeReplenishment({ stock, sold30, sold90, onOrder, threshold });
    const last = product.inventoryMovements[0] ?? null;
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      stock,
      price: product.price,
      acqPrice: product.acqPrice,
      isKit: product.isKit,
      updatedAt: product.updatedAt,
      categoryName: product.category?.name ?? null,
      supplier: product.supplier,
      image: product.images[0]?.url ?? null,
      lastMovement: last ? { at: last.createdAt, type: last.type, quantity: last.quantity } : null,
      sold30,
      sold90,
      onOrder,
      lastCost: lastPurchase?.cost ?? (Number(product.acqPrice) > 0 ? Number(product.acqPrice) : null),
      limitingComponent: limiting?.name ?? null,
      signal,
    };
  });
}

export type InventoryRow = Awaited<ReturnType<typeof getInventory>>[number];
