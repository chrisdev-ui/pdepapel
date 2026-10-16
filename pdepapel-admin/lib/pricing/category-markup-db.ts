import type { Prisma } from "@prisma/client";

import { buildMarkupResolver, markupMap, type MarkupCategory, type MarkupSampleProduct } from "./category-markup";

type Db = Pick<Prisma.TransactionClient, "product" | "category">;

/** Lo que necesita la mediana: productos activos (precio, costo, envío) y subcategorías con su categoría. Sirve con el cliente del panel y con el de solo lectura del Copiloto. */
export async function loadMarkupInputs(db: Db, storeId: string): Promise<{ products: MarkupSampleProduct[]; categories: MarkupCategory[] }> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { storeId, isArchived: false },
      select: { categoryId: true, price: true, acqPrice: true, transportationCost: true, isKit: true },
    }),
    db.category.findMany({
      where: { storeId },
      select: { id: true, name: true, typeId: true, markupOverridePercent: true, type: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    products,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      typeId: category.typeId,
      typeName: category.type.name,
      markupOverridePercent: category.markupOverridePercent,
    })),
  };
}

export async function loadMarkupMap(db: Db, storeId: string) {
  const { products, categories } = await loadMarkupInputs(db, storeId);
  return markupMap(products, categories);
}

/** Lo que daría la mediana para una subcategoría si Paula no hubiera definido el suyo. */
export async function loadMedianMarkup(db: Db, storeId: string, categoryId: string) {
  const { products, categories } = await loadMarkupInputs(db, storeId);
  return buildMarkupResolver(products, categories.map((category) => ({ ...category, markupOverridePercent: null })))(categoryId);
}
