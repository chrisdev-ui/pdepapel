import { ErrorFactory } from "@/lib/api-errors";
import { CAPSULAS_SORPRESA_ID } from "@/constants";
import { createInventoryMovement } from "@/lib/inventory";
import prismadb from "@/lib/prismadb";

/**
 * Empacar cápsulas es una **transferencia de stock**, no una compra.
 *
 * Las unidades salen de los productos de origen y entran como cápsulas: es el
 * mismo patrón de `VARIANT_CONVERSION`, donde el stock de un producto suelto
 * se reparte entre sus variantes. Las dos patas se escriben en la misma
 * transacción y quedan enlazadas por `referenceId` (el id del lote), para que
 * el kardex pueda contar la historia completa desde cualquiera de los lados.
 *
 * El costo unitario se congela en el lote: el `acqPrice` de los orígenes
 * cambia con el tiempo y el margen de una venta vieja no puede moverse con él.
 */

export interface CapsuleBatchSource {
  productId: string;
  /** Unidades de este producto que entran al lote completo. */
  quantity: number;
}

export interface PackCapsulesInput {
  storeId: string;
  /** El producto cápsula que este lote produce. */
  capsuleProductId: string;
  /** Cuántas cápsulas salen del lote. */
  quantity: number;
  sources: CapsuleBatchSource[];
  notes?: string | null;
  userId: string;
}

const round = (value: number) => Math.round(value * 100) / 100;

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw ErrorFactory.InvalidRequest(`${label} debe ser un número entero mayor a cero`);
  }
}

export async function packCapsules({
  storeId,
  capsuleProductId,
  quantity,
  sources,
  notes,
  userId,
}: PackCapsulesInput) {
  assertPositiveInteger(quantity, "La cantidad de cápsulas");
  if (sources.length === 0) {
    throw ErrorFactory.InvalidRequest("Agrega al menos un producto al lote");
  }

  // Un producto repetido en la lista es un error de dedo que, si se deja
  // pasar, descuenta dos veces y deja el lote con un costo inventado.
  const seen = new Set<string>();
  for (const source of sources) {
    assertPositiveInteger(source.quantity, "La cantidad de cada producto");
    if (seen.has(source.productId)) {
      throw ErrorFactory.InvalidRequest("Un producto aparece dos veces en el lote");
    }
    seen.add(source.productId);
  }
  if (seen.has(capsuleProductId)) {
    throw ErrorFactory.InvalidRequest(
      "La cápsula no se puede empacar dentro de sí misma",
    );
  }

  return prismadb.$transaction(async (tx) => {
    const capsuleProduct = await tx.product.findFirst({
      where: { id: capsuleProductId, storeId },
      select: { id: true, name: true, categoryId: true, isKit: true },
    });
    if (!capsuleProduct) throw ErrorFactory.NotFound("Producto cápsula no encontrado");
    if (capsuleProduct.isKit) {
      throw ErrorFactory.InvalidRequest(
        "Un kit no puede ser una cápsula: su stock lo calculan sus componentes",
      );
    }
    if (capsuleProduct.categoryId !== CAPSULAS_SORPRESA_ID) {
      throw ErrorFactory.InvalidRequest(
        "El producto cápsula debe estar en la categoría «Kits sorpresa»",
      );
    }

    const sourceProducts = await tx.product.findMany({
      where: { id: { in: Array.from(seen) }, storeId },
      select: { id: true, name: true, stock: true, acqPrice: true, isKit: true },
    });
    if (sourceProducts.length !== seen.size) {
      throw ErrorFactory.InvalidRequest("Un producto del lote no existe en esta tienda");
    }
    const byId = new Map(sourceProducts.map((product) => [product.id, product]));

    // Se valida TODO antes de tocar nada: un lote a medias deja unidades
    // descontadas de bodega que no están dentro de ninguna cápsula.
    let totalCost = 0;
    for (const source of sources) {
      const product = byId.get(source.productId)!;
      if (product.isKit) {
        throw ErrorFactory.InvalidRequest(
          `“${product.name}” es un kit: empaca sus componentes, no el kit`,
        );
      }
      if (product.stock < source.quantity) {
        throw ErrorFactory.InsufficientStock(
          product.name,
          product.stock,
          source.quantity,
        );
      }
      const unitCost = Number(product.acqPrice || 0);
      if (unitCost <= 0) {
        throw ErrorFactory.InvalidRequest(
          `Registra el costo de “${product.name}” antes de empacarlo en cápsulas`,
        );
      }
      totalCost += unitCost * source.quantity;
    }

    totalCost = round(totalCost);
    const unitCost = round(totalCost / quantity);

    const batch = await tx.capsuleBatch.create({
      data: {
        storeId,
        capsuleProductId,
        quantity,
        unitCost,
        totalCost,
        notes: notes?.trim() || null,
        createdBy: userId,
        items: {
          create: sources.map((source) => ({
            productId: source.productId,
            quantity: source.quantity,
            unitCost: Number(byId.get(source.productId)!.acqPrice || 0),
          })),
        },
      },
      select: { id: true },
    });

    for (const source of sources) {
      await createInventoryMovement(tx, {
        productId: source.productId,
        storeId,
        type: "CAPSULE_PACKED",
        quantity: -source.quantity,
        reason: `Empacado en “${capsuleProduct.name}”`,
        referenceId: batch.id,
        cost: Number(byId.get(source.productId)!.acqPrice || 0),
        createdBy: userId,
      });
    }

    await createInventoryMovement(tx, {
      productId: capsuleProductId,
      storeId,
      type: "CAPSULE_PACKED",
      quantity,
      reason: `Lote de ${quantity} cápsulas`,
      referenceId: batch.id,
      cost: unitCost,
      createdBy: userId,
    });

    // El costo de la cápsula es el del último lote: es lo que de verdad costó
    // lo que hoy está en la estantería, y de ahí sale el margen de la venta.
    await tx.product.update({
      where: { id: capsuleProductId },
      data: { acqPrice: unitCost },
    });

    return tx.capsuleBatch.findUniqueOrThrow({
      where: { id: batch.id },
      include: {
        capsuleProduct: { select: { id: true, name: true, sku: true, stock: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
    });
  });
}

/**
 * Deshacer un lote: las cápsulas vuelven a ser sus productos de origen.
 *
 * Solo mientras no se haya vendido ninguna. Igual que una feria cerrada, un
 * lote con ventas encima ya es historia: devolver esas unidades a bodega
 * inventaría stock que no existe.
 */
export async function unpackCapsuleBatch({
  storeId,
  batchId,
  userId,
}: {
  storeId: string;
  batchId: string;
  userId: string;
}) {
  return prismadb.$transaction(async (tx) => {
    const batch = await tx.capsuleBatch.findFirst({
      where: { id: batchId, storeId },
      include: {
        items: true,
        capsuleProduct: { select: { id: true, name: true, stock: true } },
      },
    });
    if (!batch) throw ErrorFactory.NotFound("Lote no encontrado");
    if (batch.unpackedAt) {
      throw ErrorFactory.Conflict("Este lote ya se deshizo");
    }
    if (batch.capsuleProduct.stock < batch.quantity) {
      throw ErrorFactory.Conflict(
        `Ya se vendieron cápsulas de este lote: quedan ${batch.capsuleProduct.stock} de ${batch.quantity}. Deshacerlo devolvería a bodega unidades que ya salieron.`,
      );
    }

    await createInventoryMovement(tx, {
      productId: batch.capsuleProductId,
      storeId,
      type: "CAPSULE_UNPACKED",
      quantity: -batch.quantity,
      reason: "Lote deshecho",
      referenceId: batch.id,
      cost: batch.unitCost,
      createdBy: userId,
    });

    for (const item of batch.items) {
      await createInventoryMovement(tx, {
        productId: item.productId,
        storeId,
        type: "CAPSULE_UNPACKED",
        quantity: item.quantity,
        reason: `Devuelto de “${batch.capsuleProduct.name}”`,
        referenceId: batch.id,
        cost: item.unitCost,
        createdBy: userId,
      });
    }

    return tx.capsuleBatch.update({
      where: { id: batch.id },
      data: { unpackedAt: new Date(), unpackedBy: userId },
    });
  });
}
