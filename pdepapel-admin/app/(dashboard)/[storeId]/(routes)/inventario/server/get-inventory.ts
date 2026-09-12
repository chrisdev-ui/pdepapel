import { CAPSULAS_SORPRESA_ID } from "@/constants";
import prismadb from "@/lib/prismadb";
import { resolveLowStockThreshold } from "@/lib/product-readiness";
import { addKitDemand, computeReplenishment, limitingKitComponent, type ReplenishmentSignal } from "@/lib/replenishment";
import { getReplenishmentContext } from "@/lib/replenishment-db";

/** De dónde sale el costo con el que se arma un borrador de reposición. */
export type LastCostSource = "purchase" | "product";

/**
 * Lista de Inventario con la señal de reposición por producto: ventas de 30 y
 * 90 días (directas y dentro de kits), cobertura, unidades en camino,
 * sugerido y último costo de compra. Los kits toman su stock del componente
 * más escaso.
 *
 * Las cápsulas sorpresa quedan fuera: son un producto de feria que se arma
 * con productos normales, y esos sí están en la lista.
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
      },
      orderBy: { stock: "asc" },
    }),
    prismadb.store.findUnique({ where: { id: storeId }, select: { lowStockThreshold: true } }),
    getReplenishmentContext(storeId, now),
  ]);
  const threshold = resolveLowStockThreshold(store);

  // Lo que se vende dentro de un kit consume el stock del componente: cuenta
  // como demanda del componente aunque el pedido lleve el kit.
  const kits = products
    .filter((product) => product.isKit && product.kitComponents.length > 0)
    .map((product) => ({ id: product.id, components: product.kitComponents.map((c) => ({ componentId: c.component.id, quantity: c.quantity })) }));
  const demand30 = addKitDemand(context.sold30, kits);
  const demand90 = addKitDemand(context.sold90, kits);

  return products.map((product) => {
    let stock = product.stock;
    let limiting: { name: string; kits: number } | null = null;
    if (product.isKit && product.kitComponents.length > 0) {
      const components = product.kitComponents.map((c) => ({ name: c.component.name, quantity: c.quantity, stock: c.component.stock }));
      limiting = limitingKitComponent(components);
      stock = Math.max(0, limiting?.kits ?? 0);
    }
    const sold30 = demand30.total.get(product.id) ?? 0;
    const sold90 = demand90.total.get(product.id) ?? 0;
    const soldViaKits30 = demand30.viaKits.get(product.id) ?? 0;
    const onOrder = context.onOrder.get(product.id) ?? 0;
    const lastPurchase = context.lastPurchase.get(product.id) ?? null;
    const signal: ReplenishmentSignal = computeReplenishment({ stock, sold30, sold90, onOrder, threshold });
    const productCost = Number(product.acqPrice) > 0 ? Number(product.acqPrice) : null;
    const lastCost = product.isKit ? null : (lastPurchase?.cost ?? productCost);
    const lastCostSource: LastCostSource | null = product.isKit ? null : lastPurchase ? "purchase" : productCost ? "product" : null;
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
      sold30,
      sold90,
      /** Parte de `sold30` que salió dentro de kits. */
      soldViaKits30,
      onOrder,
      lastCost,
      lastCostSource,
      /** Fecha de la última compra recibida; null si el costo viene del producto. */
      lastCostAt: lastPurchase?.at ?? null,
      limitingComponent: limiting?.name ?? null,
      signal,
    };
  });
}

export type InventoryRow = Awaited<ReturnType<typeof getInventory>>[number];
