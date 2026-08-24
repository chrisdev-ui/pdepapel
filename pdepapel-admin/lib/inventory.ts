import { Prisma, PrismaClient } from "@prisma/client";
import { ErrorFactory } from "./api-errors";
import {
  MANUAL_ADJUSTMENT_OPTIONS,
  MOVEMENT_TYPE_LABELS,
  type MovementType,
} from "./inventory-constants";
import { queueMarketplaceStockSyncEvents } from "./mercadolibre/outbox";

export {
  MANUAL_ADJUSTMENT_OPTIONS,
  MOVEMENT_TYPE_LABELS,
  type MovementType,
} from "./inventory-constants";

// Define a type that can be a transaction client or the main client
type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface CreateInventoryMovementParams {
  productId: string;
  storeId: string;
  type: MovementType;
  quantity: number; // Positive = Add to stock, Negative = Remove from stock
  reason?: string;
  description?: string;
  referenceId?: string;
  cost?: number; // Unit cost at the time of movement
  price?: number; // Unit sell price at the time of movement
  createdBy?: string; // User ID or "SYSTEM"
}

export async function createInventoryMovement(
  tx: PrismaTx,
  data: CreateInventoryMovementParams,
) {
  const {
    productId,
    storeId,
    type,
    quantity,
    reason,
    description,
    referenceId,
    cost,
    price,
    createdBy,
  } = data;

  const product = await tx.product.findFirst({
    where: { id: productId, storeId },
    select: { stock: true, name: true },
  });
  if (!product) throw ErrorFactory.NotFound("Producto no encontrado");

  const previousStock = product.stock;
  const newStock = previousStock + quantity;

  if (quantity !== 0) {
    const update = await tx.product.updateMany({
      where: {
        id: productId,
        storeId,
        ...(quantity < 0 ? { stock: { gte: Math.abs(quantity) } } : {}),
      },
      data: {
        stock: {
          [quantity > 0 ? "increment" : "decrement"]: Math.abs(quantity),
        },
      },
    });
    if (update.count !== 1) {
      if (quantity < 0) {
        throw ErrorFactory.InsufficientStock(
          product.name,
          previousStock,
          Math.abs(quantity),
        );
      }
      throw ErrorFactory.NotFound("Producto no encontrado");
    }
  }

  const movement = await tx.inventoryMovement.create({
    data: {
      storeId,
      productId,
      type,
      quantity,
      previousStock,
      newStock,
      reason,
      description,
      referenceId,
      cost,
      price,
      createdBy,
    },
  });

  const parentKits = await tx.productKit.findMany({
    where: { componentId: productId },
    select: { kitId: true },
  });

  if (parentKits.length > 0) {
    const kitIds = Array.from(new Set(parentKits.map((p) => p.kitId)));
    await recalculateKitStock(tx, kitIds);
    await queueMarketplaceStockSyncEvents(tx, [productId, ...kitIds]);
  } else {
    await queueMarketplaceStockSyncEvents(tx, [productId]);
  }

  return movement;
}

// -- KIT LOGIC --

export async function recalculateKitStock(tx: PrismaTx, kitIds: string[]) {
  if (kitIds.length === 0) return;

  const kits = await tx.product.findMany({
    where: { id: { in: kitIds }, isKit: true },
    include: {
      kitComponents: {
        include: {
          component: { select: { stock: true } },
        },
      },
    },
  });

  for (const kit of kits) {
    // If no components, stock is 0 (or manually managed? Plan said determined by components)
    if (kit.kitComponents.length === 0) {
      // Option: Do nothing, or set to 0. Let's set to 0 to be safe.
      await tx.product.update({
        where: { id: kit.id },
        data: { stock: 0 },
      });
      continue;
    }

    // Calculate max available kits based on components
    // Example: Copmonent A (Stock 10, Qty 2) -> 10/2 = 5 kits.
    //          Component B (Stock 3, Qty 1) -> 3/1 = 3 kits.
    //          Max Kits = 3 (Min of results)

    let maxKits = Number.MAX_SAFE_INTEGER;

    for (const item of kit.kitComponents) {
      const componentStock = item.component.stock;
      const requiredQty = item.quantity;

      if (requiredQty <= 0) continue; // Should not happen, but avoid division by zero

      const possible = Math.floor(componentStock / requiredQty);
      if (possible < maxKits) {
        maxKits = possible;
      }
    }

    // Safety check if maxKits wasn't touched (e.g. all qty 0)
    if (maxKits === Number.MAX_SAFE_INTEGER) maxKits = 0;
    // Don't allow negative
    if (maxKits < 0) maxKits = 0;

    await tx.product.update({
      where: { id: kit.id },
      data: { stock: maxKits },
    });
  }
}

export async function validateStockAvailability(
  tx: PrismaTx,
  items: { productId: string; quantity: number }[],
) {
  // Group by product to handle duplicate entries
  const groupedItems = items.reduce(
    (acc, item) => {
      acc[item.productId] = (acc[item.productId] || 0) + item.quantity;
      return acc;
    },
    {} as Record<string, number>,
  );

  const productIds = Object.keys(groupedItems);
  if (productIds.length === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, stock: true, name: true, isKit: true },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Separate normal products from Kits
  // Kits need recursive validation of their components
  const kitValidations: { productId: string; quantity: number }[] = [];
  const normalChecks: {
    productId: string;
    productName: string;
    available: number;
    requested: number;
  }[] = [];

  for (const [productId, requiredQty] of Object.entries(groupedItems)) {
    const product = productMap.get(productId);
    if (!product) {
      throw ErrorFactory.NotFound(`Producto no encontrado: ${productId}`);
    }

    if (product.isKit) {
      kitValidations.push({ productId, quantity: requiredQty });
    } else {
      // Checking strictly: requiredQty is positive for requirements
      if (requiredQty > 0 && product.stock < requiredQty) {
        normalChecks.push({
          productId: product.id,
          productName: product.name,
          available: product.stock,
          requested: requiredQty,
        });
      }
    }
  }

  // If we have kits, we need to "explode" them into components and validate those components
  // ALONG WITH any other components that might be in the cart directly.
  if (kitValidations.length > 0) {
    // Find all components for these kits
    const kits = await tx.product.findMany({
      where: { id: { in: kitValidations.map((k) => k.productId) } },
      include: { kitComponents: true },
    });

    const componentRequirements: { productId: string; quantity: number }[] = [];

    for (const kitReq of kitValidations) {
      const kit = kits.find((k) => k.id === kitReq.productId);
      if (!kit || !kit.kitComponents) continue;

      for (const component of kit.kitComponents) {
        componentRequirements.push({
          productId: component.componentId,
          quantity: component.quantity * kitReq.quantity, // Scale by kit quantity
        });
      }
    }

    // Recursively validate components (merged with current transaction state validation)
    // Note: This effectively branches the recursion.
    // We pass 'false' to allow recursion? logic is simple function call.
    if (componentRequirements.length > 0) {
      await validateStockAvailability(tx, componentRequirements);
    }
  }

  if (normalChecks.length > 0) {
    // Always use MultipleInsufficientStock to provide consistent error structure (array of items)
    // This allows the frontend to generically handle "details.items" for highlighting.
    const missingFormatted = normalChecks.map((c) => ({
      productId: c.productId,
      productName: c.productName,
      available: c.available,
      requested: c.requested,
    }));
    throw ErrorFactory.MultipleInsufficientStock(missingFormatted);
  }
}

export async function createInventoryMovementBatch(
  tx: PrismaTx,
  movements: CreateInventoryMovementParams[],
  validate: boolean = true,
) {
  if (movements.length === 0) return;

  // 1. Validate total requirements if needed (only for decrements)
  if (validate) {
    const decrements = movements
      .filter((m) => m.quantity < 0)
      .map((m) => ({
        productId: m.productId,
        quantity: Math.abs(m.quantity),
      }));

    await validateStockAvailability(tx, decrements);
  }

  // 2. Pre-fetch all product details in one go to avoid N+1 reads in loop
  const productIds = Array.from(new Set(movements.map((m) => m.productId)));
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, stock: true },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  // 3. Prepare creates and updates
  // NOTE: We cannot use createMany easily because each movement has different data (previousStock)
  // But we can optimize by calculating snapshots in memory from our pre-fetch.

  // To maintain correct "previousStock" in the log for sequential items of the SAME product in this batch,
  // we need to track the running stock.
  const runningStockMap = new Map(
    products.map((product) => [product.id, product.stock]),
  );

  for (const movement of movements) {
    const product = productMap.get(movement.productId);
    const currentStock = runningStockMap.get(movement.productId);
    if (!product || currentStock === undefined) {
      throw ErrorFactory.NotFound("Producto no encontrado");
    }
    const nextStock = currentStock + movement.quantity;

    if (movement.quantity !== 0) {
      const update = await tx.product.updateMany({
        where: {
          id: movement.productId,
          storeId: movement.storeId,
          ...(movement.quantity < 0
            ? { stock: { gte: Math.abs(movement.quantity) } }
            : {}),
        },
        data: {
          stock: {
            [movement.quantity > 0 ? "increment" : "decrement"]: Math.abs(
              movement.quantity,
            ),
          },
        },
      });
      if (update.count !== 1) {
        if (movement.quantity < 0) {
          throw ErrorFactory.InsufficientStock(
            product.name,
            currentStock,
            Math.abs(movement.quantity),
          );
        }
        throw ErrorFactory.NotFound("Producto no encontrado");
      }
    }

    await tx.inventoryMovement.create({
      data: {
        storeId: movement.storeId,
        productId: movement.productId,
        type: movement.type,
        quantity: movement.quantity,
        previousStock: currentStock,
        newStock: nextStock,
        reason: movement.reason,
        description: movement.description,
        referenceId: movement.referenceId,
        cost: movement.cost,
        price: movement.price,
        createdBy: movement.createdBy,
      },
    });

    runningStockMap.set(movement.productId, nextStock);
  }

  // Reactive: recalculate kit stock for any affected parent kits
  const allAffectedIds = Array.from(new Set(movements.map((m) => m.productId)));
  const parentKits = await tx.productKit.findMany({
    where: { componentId: { in: allAffectedIds } },
    select: { kitId: true },
  });
  if (parentKits.length > 0) {
    const kitIds = Array.from(new Set(parentKits.map((p) => p.kitId)));
    await recalculateKitStock(tx, kitIds);
    await queueMarketplaceStockSyncEvents(tx, [...allAffectedIds, ...kitIds]);
  } else {
    await queueMarketplaceStockSyncEvents(tx, allAffectedIds);
  }
}

export async function createInventoryMovementBatchResilient(
  tx: PrismaTx,
  movements: CreateInventoryMovementParams[],
) {
  const results = {
    success: [] as {
      productId: string;
      quantity: number;
      productName: string;
    }[],
    failed: [] as {
      productId: string;
      quantity: number;
      productName: string;
      reason: string;
    }[],
  };

  // Pre-fetch names for reporting
  const productIds = Array.from(new Set(movements.map((m) => m.productId)));
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, stock: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Process sequentially to isolate failures
  for (const movement of movements) {
    const product = productMap.get(movement.productId);
    if (!product) {
      results.failed.push({
        productId: movement.productId,
        quantity: movement.quantity,
        productName: "Desconocido",
        reason: "Producto no encontrado",
      });
      continue;
    }

    try {
      // Validate individual item if it's a decrement
      if (movement.quantity < 0) {
        // We check against the LATEST known state in DB?
        // Or since we are inside a transaction, we accept we verify against snapshot?
        // Let's re-verify strict availability to be safe (small penalty for safety)
        if (product.stock < Math.abs(movement.quantity)) {
          throw new Error(`Stock insuficiente. Disponible: ${product.stock}`);
        }
      }

      // Create movement individually (re-using single function which does atomic update)
      // Note: This calls findUniqueOrThrow inside, which is 1 extra read per item.
      // But for "Resilient" (partial failure), we accept this cost for safety.
      // Optimization: we could rewrite logic here to avoid re-read, but let's trust createInventoryMovement
      // which now uses ATOMIC updates.
      await createInventoryMovement(tx, movement);

      results.success.push({
        productId: movement.productId,
        quantity: movement.quantity,
        productName: product.name,
      });

      // Update our local map in case we have multiple Ops for same product in this batch
      product.stock += movement.quantity;
    } catch (error: any) {
      results.failed.push({
        productId: movement.productId,
        quantity: movement.quantity,
        productName: product.name,
        reason: error.message || "Error desconocido",
      });
    }
  }

  // Reactive: recalculate kit stock for any affected parent kits
  if (results.success.length > 0) {
    const successIds = results.success.map((s) => s.productId);
    const parentKits = await tx.productKit.findMany({
      where: { componentId: { in: successIds } },
      select: { kitId: true },
    });
    if (parentKits.length > 0) {
      const kitIds = Array.from(new Set(parentKits.map((p) => p.kitId)));
      await recalculateKitStock(tx, kitIds);
    }
  }

  return results;
}
