"use server";

import prismadb from "@/lib/prismadb";

/** Subcategorías que se listan en la tarjeta «Uso» antes de resumir el resto. */
const CATEGORY_PREVIEW_LIMIT = 6;

/**
 * Categoría (modelo `Type`) de una tienda con lo que el formulario necesita
 * para hablar con honestidad: cuántas subcategorías tiene, cuántas siguen
 * activas, cuántas tienen productos y cuántos productos hay en total.
 * Siempre acotada por `storeId`; un id de otra tienda devuelve `null`.
 */
export async function getType(storeId: string, typeId: string) {
  const type = await prismadb.type.findFirst({
    where: { id: typeId, storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      iconSvg: true,
      isArchived: true,
      archivedAt: true,
      createdAt: true,
      categories: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          isArchived: true,
          _count: { select: { products: true } },
        },
      },
    },
  });
  if (!type) return null;

  const { categories, ...rest } = type;
  const productsCount = categories.reduce((sum, category) => sum + category._count.products, 0);

  return {
    ...rest,
    categoriesCount: categories.length,
    activeCategoriesCount: categories.filter((category) => !category.isArchived).length,
    categoriesWithProducts: categories.filter((category) => category._count.products > 0).length,
    productsCount,
    categoryPreview: categories.slice(0, CATEGORY_PREVIEW_LIMIT).map((category) => ({
      id: category.id,
      name: category.name,
      isArchived: category.isArchived,
      productsCount: category._count.products,
    })),
  };
}

export type TypeDetail = NonNullable<Awaited<ReturnType<typeof getType>>>;
