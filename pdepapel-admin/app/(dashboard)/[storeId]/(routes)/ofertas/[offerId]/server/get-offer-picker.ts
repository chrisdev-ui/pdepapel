import prismadb from "@/lib/prismadb";

/**
 * Lo que el formulario de oferta necesita para elegir destinos: nada de
 * costos, GTIN ni kardex (antes se enviaba el catálogo completo al cliente).
 */
export async function getOfferPickerData(storeId: string) {
  const [products, categories, productGroups] = await Promise.all([
    prismadb.product.findMany({
      where: { storeId, isArchived: false },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        categoryId: true,
        productGroupId: true,
        category: { select: { name: true } },
        images: { select: { url: true }, where: { isMain: true }, take: 1 },
      },
      orderBy: { name: "asc" },
    }),
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
  ]);

  return {
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      stock: product.stock,
      categoryId: product.categoryId,
      productGroupId: product.productGroupId,
      categoryName: product.category.name,
      imageUrl: product.images.at(0)?.url ?? null,
    })),
    categories: categories.map((category) => ({ id: category.id, name: category.name, typeName: category.type.name, productCount: category._count.products })),
    productGroups: productGroups.map((group) => ({ id: group.id, name: group.name, productCount: group._count.products })),
  };
}

export type OfferPickerData = Awaited<ReturnType<typeof getOfferPickerData>>;
