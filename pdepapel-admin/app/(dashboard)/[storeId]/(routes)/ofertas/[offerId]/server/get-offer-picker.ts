import { loadScopeProducts, type ScopeProductRow } from "@/lib/offer-scope";
import prismadb from "@/lib/prismadb";

/**
 * Lo que el formulario necesita de entrada: subcategorías y grupos (listas cortas)
 * y los productos ya elegidos. Los demás productos se buscan por la API de a 20.
 */
export async function getOfferPickerData(storeId: string, selectedProductIds: string[] = [], excludeOfferId: string | null = null) {
  const [categories, productGroups, selectedProducts] = await Promise.all([
    prismadb.category.findMany({
      where: { storeId, isArchived: false },
      select: { id: true, name: true, type: { select: { name: true } }, _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    }),
    prismadb.productGroup.findMany({
      where: { storeId },
      select: { id: true, name: true, _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    }),
    loadScopeProducts(prismadb, storeId, selectedProductIds, excludeOfferId),
  ]);

  return {
    categories: categories.map((category) => ({ id: category.id, name: category.name, typeName: category.type.name, productCount: category._count.products })),
    productGroups: productGroups.map((group) => ({ id: group.id, name: group.name, productCount: group._count.products })),
    selectedProducts: selectedProducts as ScopeProductRow[],
  };
}

export type OfferPickerData = Awaited<ReturnType<typeof getOfferPickerData>>;
