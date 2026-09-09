import { Product } from "@/types";

/**
 * Lo que vale la pena guardar en el navegador de un producto del carrito o
 * de favoritos: lo que pintan las listas y lo que necesita el checkout. La
 * descripción, las reseñas, el kit y las fotos secundarias se vuelven a pedir
 * al catálogo cuando hace falta.
 */
export function slimStoredProduct(product: Product): Product {
  const images = product.images ?? [];
  const main = images.find((image) => image.isMain) ?? images[0];
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: "",
    price: product.price,
    stock: product.stock,
    quantity: product.quantity,
    sku: product.sku,
    isFeatured: product.isFeatured,
    isArchived: product.isArchived,
    availableAt: product.availableAt,
    createdAt: product.createdAt,
    category: product.category ? { id: product.category.id, typeId: product.category.typeId, name: product.category.name, slug: product.category.slug } : product.category,
    size: product.size,
    color: product.color,
    design: product.design,
    images: main ? [{ id: main.id, url: main.url, isMain: true }] : [],
    reviews: [],
    originalPrice: product.originalPrice,
    discountedPrice: product.discountedPrice,
    offerLabel: product.offerLabel,
    hasDiscount: product.hasDiscount,
    isGroup: product.isGroup,
    variantCount: product.variantCount,
    productGroupId: product.productGroupId,
    minPrice: product.minPrice,
    maxPrice: product.maxPrice,
    isKit: product.isKit,
    catalogOptionValues: product.catalogOptionValues,
  } as Product;
}
