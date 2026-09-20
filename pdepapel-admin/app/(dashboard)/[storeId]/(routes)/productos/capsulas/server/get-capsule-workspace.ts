import { CAPSULAS_SORPRESA_ID } from "@/constants";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

export interface CapsuleProductOption {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
}

export interface SourceProductOption {
  id: string;
  name: string;
  sku: string;
  stock: number;
  acqPrice: number;
}

export interface CapsuleBatchRow {
  id: string;
  createdAt: string;
  capsuleName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  unpackedAt: string | null;
  /** Cápsulas de este lote que siguen en la estantería; por debajo ya se vendió. */
  capsuleStock: number;
  items: { name: string; sku: string; quantity: number }[];
}

/**
 * Todo lo que necesita la pantalla de empaque.
 *
 * Es `requireStoreOwner` y no `requireStoreRead` a propósito: la lista de
 * orígenes trae `acqPrice`, que es costo, y una cuenta de solo lectura no ve
 * costos.
 */
export async function getCapsuleWorkspace(storeId: string) {
  await requireStoreOwner(storeId);

  const [capsuleProducts, sourceProducts, batches] = await Promise.all([
    prismadb.product.findMany({
      where: { storeId, categoryId: CAPSULAS_SORPRESA_ID, isArchived: false },
      select: { id: true, name: true, sku: true, stock: true, price: true },
      orderBy: { name: "asc" },
    }),
    prismadb.product.findMany({
      where: {
        storeId,
        isArchived: false,
        isKit: false,
        categoryId: { not: CAPSULAS_SORPRESA_ID },
        stock: { gt: 0 },
      },
      select: { id: true, name: true, sku: true, stock: true, acqPrice: true },
      orderBy: { name: "asc" },
    }),
    prismadb.capsuleBatch.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        capsuleProduct: { select: { name: true, stock: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
    }),
  ]);

  return {
    capsuleProducts: capsuleProducts.map((product) => ({
      ...product,
      price: Number(product.price),
    })) satisfies CapsuleProductOption[],
    sourceProducts: sourceProducts.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      stock: product.stock,
      acqPrice: Number(product.acqPrice || 0),
    })) satisfies SourceProductOption[],
    batches: batches.map((batch) => ({
      id: batch.id,
      createdAt: batch.createdAt.toISOString(),
      capsuleName: batch.capsuleProduct.name,
      quantity: batch.quantity,
      unitCost: batch.unitCost,
      totalCost: batch.totalCost,
      unpackedAt: batch.unpackedAt ? batch.unpackedAt.toISOString() : null,
      capsuleStock: batch.capsuleProduct.stock,
      items: batch.items.map((item) => ({
        name: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
      })),
    })) satisfies CapsuleBatchRow[],
  };
}
