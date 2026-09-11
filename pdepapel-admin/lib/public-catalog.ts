import { Prisma } from "@prisma/client";

import { PUBLIC_REVIEW_INCLUDE } from "@/lib/review-moderation";

/**
 * Lo que la tienda en línea (y cualquier visitante, porque las rutas del
 * catálogo no piden sesión) puede ver de un producto.
 *
 * Regla del panel: toda ruta pública devuelve datos únicamente a través de
 * estos `select`. Una columna nueva en `Product` queda oculta hasta que
 * alguien la agregue aquí a propósito; así `acqPrice`, `transportationCost`,
 * `supplierId`, `abcClassification` o `soldCount` no vuelven a salir por
 * accidente. Nunca cambiar un `select` de este archivo por `include`.
 */

export const PUBLIC_IMAGE_SELECT = {
  id: true,
  url: true,
  isMain: true,
} satisfies Prisma.ImageSelect;

export const PUBLIC_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  typeId: true,
} satisfies Prisma.CategorySelect;

export const PUBLIC_PRODUCT_GROUP_SELECT = {
  id: true,
  name: true,
  slug: true,
  brand: true,
  description: true,
} satisfies Prisma.ProductGroupSelect;

export const PUBLIC_COLOR_SELECT = {
  id: true,
  name: true,
  value: true,
} satisfies Prisma.ColorSelect;

export const PUBLIC_SIZE_SELECT = {
  id: true,
  name: true,
  value: true,
} satisfies Prisma.SizeSelect;

export const PUBLIC_DESIGN_SELECT = {
  id: true,
  name: true,
} satisfies Prisma.DesignSelect;

export const PUBLIC_CATALOG_OPTION_VALUE_SELECT = {
  option: {
    select: { id: true, key: true, name: true, displayOrder: true },
  },
  optionValue: { select: { id: true, name: true, value: true } },
} satisfies Prisma.ProductCatalogOptionValueSelect;

/** Componentes de un kit tal como los muestra la página del producto. */
export const PUBLIC_KIT_COMPONENT_SELECT = {
  quantity: true,
  component: {
    select: {
      id: true,
      slug: true,
      name: true,
      stock: true,
      images: { where: { isMain: true }, select: PUBLIC_IMAGE_SELECT },
    },
  },
} satisfies Prisma.ProductKitSelect;

/** Producto para listas y tarjetas: identidad, precio, stock, medios y taxonomía. */
export const PUBLIC_PRODUCT_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  price: true,
  stock: true,
  isFeatured: true,
  isArchived: true,
  isKit: true,
  availableAt: true,
  createdAt: true,
  sku: true,
  brand: true,
  gtin: true,
  mpn: true,
  categoryId: true,
  colorId: true,
  sizeId: true,
  designId: true,
  productGroupId: true,
  images: { select: PUBLIC_IMAGE_SELECT },
  category: { select: PUBLIC_CATEGORY_SELECT },
  color: { select: PUBLIC_COLOR_SELECT },
  size: { select: PUBLIC_SIZE_SELECT },
  design: { select: PUBLIC_DESIGN_SELECT },
  productGroup: { select: PUBLIC_PRODUCT_GROUP_SELECT },
  reviews: PUBLIC_REVIEW_INCLUDE,
} satisfies Prisma.ProductSelect;

/** Producto para la página de detalle: lo anterior más opciones de catálogo y kit. */
export const PUBLIC_PRODUCT_DETAIL_SELECT = {
  ...PUBLIC_PRODUCT_SELECT,
  catalogOptionValues: { select: PUBLIC_CATALOG_OPTION_VALUE_SELECT },
  kitComponents: { select: PUBLIC_KIT_COMPONENT_SELECT },
} satisfies Prisma.ProductSelect;

export type PublicProductRecord = Prisma.ProductGetPayload<{
  select: typeof PUBLIC_PRODUCT_SELECT;
}>;

export type PublicProductDetailRecord = Prisma.ProductGetPayload<{
  select: typeof PUBLIC_PRODUCT_DETAIL_SELECT;
}>;

/**
 * Versión de la forma que se guarda en Redis para `GET /products`. Súbela
 * cuando cambie lo que se devuelve: las entradas viejas dejan de leerse en el
 * acto y caducan solas (máximo 15 minutos) sin ningún paso manual.
 */
export const PUBLIC_PRODUCTS_CACHE_VERSION = "v2";

/** Campos de `Product` que nunca deben salir por una ruta pública (para pruebas). */
export const INTERNAL_PRODUCT_FIELDS = [
  "acqPrice",
  "transportationCost",
  "supplierId",
  "supplier",
  "abcClassification",
  "soldCount",
  "shippingProfileId",
  "hasNoProductIdentifier",
  "storeId",
] as const;
