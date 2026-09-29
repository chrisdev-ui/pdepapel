import prismadb from "@/lib/prismadb";
import { getProductsPrices } from "@/lib/discount-engine";
import {
  PUBLIC_CATEGORY_SELECT,
  PUBLIC_COLOR_SELECT,
  PUBLIC_DESIGN_SELECT,
  PUBLIC_IMAGE_SELECT,
  PUBLIC_SIZE_SELECT,
} from "@/lib/public-catalog";
import { PUBLIC_REVIEW_WHERE } from "@/lib/review-moderation";

/** Cuántas familias admite una consulta: favoritos tiene tope de 200 filas. */
export const MAX_FAMILIES_PER_REQUEST = 100;

/**
 * Una familia (grupo de variantes) con la misma forma que le da el listado
 * agrupado de la tienda: nombre del grupo, rango de precio, número de
 * opciones, stock sumado y la variante que le pone cara (la primera con
 * stock). Sirve para refrescar un favorito guardado como familia sin que se
 * convierta en la variante que la representaba el día que se guardó.
 *
 * Sin caché a propósito: es la consulta viva de favoritos, igual que `ids=`.
 * Un grupo cuyas variantes estén todas archivadas no se devuelve.
 */
export async function loadProductFamilies(storeId: string, groupIds: string[]) {
  const ids = Array.from(new Set(groupIds.filter(Boolean))).slice(
    0,
    MAX_FAMILIES_PER_REQUEST,
  );
  if (ids.length === 0) return [];

  const groups = await prismadb.productGroup.findMany({
    where: { storeId, id: { in: ids } },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      images: { select: PUBLIC_IMAGE_SELECT },
      products: {
        where: { isArchived: false },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          slug: true,
          price: true,
          stock: true,
          categoryId: true,
          productGroupId: true,
          category: { select: PUBLIC_CATEGORY_SELECT },
          color: { select: PUBLIC_COLOR_SELECT },
          size: { select: PUBLIC_SIZE_SELECT },
          design: { select: PUBLIC_DESIGN_SELECT },
          images: { select: PUBLIC_IMAGE_SELECT },
          isFeatured: true,
          availableAt: true,
          createdAt: true,
          reviews: { where: PUBLIC_REVIEW_WHERE, select: { rating: true } },
        },
      },
    },
  });

  const variants = groups.flatMap((group) =>
    group.products.map((product) => ({
      id: product.id,
      categoryId: product.categoryId,
      price: Number(product.price),
      productGroupId: product.productGroupId,
    })),
  );
  const pricing = await getProductsPrices(variants, storeId);

  return groups.flatMap((group) => {
    if (group.products.length === 0) return [];
    const primary =
      group.products.find((product) => product.stock > 0) ?? group.products[0];
    const priced = group.products.map((product) => {
      const offer = pricing.get(product.id);
      const base = Number(product.price);
      return {
        base,
        effective: offer?.price ?? base,
        hasDiscount: Boolean(offer && offer.discount > 0),
        offerLabel: offer?.offerLabel ?? null,
      };
    });
    const cheapest = [...priced].sort((a, b) => a.effective - b.effective)[0];
    const minBase = Math.min(...priced.map((item) => item.base));
    const minEffective = Math.min(...priced.map((item) => item.effective));
    const maxEffective = Math.max(...priced.map((item) => item.effective));
    const hasDiscount = priced.some((item) => item.hasDiscount);

    return [
      {
        id: primary.id,
        productGroupId: group.id,
        slug: primary.slug,
        name: group.name,
        description: group.description,
        images: group.images.length > 0 ? group.images : primary.images,
        price: minEffective,
        originalPrice: minBase,
        discountedPrice: minEffective,
        hasDiscount,
        offerLabel: hasDiscount ? cheapest.offerLabel : null,
        isGroup: true,
        minPrice: minEffective,
        maxPrice: maxEffective,
        variantCount: group.products.length,
        category: primary.category,
        categoryId: primary.categoryId,
        color: null,
        size: null,
        design: null,
        reviews: group.products.flatMap((product) => product.reviews),
        sku: "GROUP",
        createdAt: group.createdAt,
        stock: group.products.reduce((sum, product) => sum + product.stock, 0),
        isFeatured: group.products.some((product) => product.isFeatured),
        availableAt: primary.availableAt ?? null,
        presales: [],
      },
    ];
  });
}
