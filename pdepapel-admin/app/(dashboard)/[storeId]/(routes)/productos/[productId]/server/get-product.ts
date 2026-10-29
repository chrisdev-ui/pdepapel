import "server-only";

import { loadBrandOptions } from "@/lib/brand-options";
import { SUPPLIER_PICKER_SELECT } from "@/lib/public-catalog";
import { GALLERY_ORDER } from "@/lib/variant-gallery";
import { GROUP_VARIANT_COMBINATION_SELECT } from "@/lib/variant-combinations";
import { ErrorFactory } from "@/lib/api-errors";
import { requireStoreRead } from "@/lib/store-access";

import { ProductPresaleStatus } from "@prisma/client";
import {
  ACTIVE_ATTRIBUTE_WHERE,
  activeOrCurrentWhere,
} from "@/lib/attribute-archive";
import { loadMarkupMap } from "@/lib/pricing/category-markup-db";
import prismadb from "@/lib/prismadb";
import { scrubProduct, scrubReviews } from "@/lib/viewer-payloads";
import { NEW_PRODUCT_SEGMENT } from "@/lib/product-routes";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const GROUP_VARIANT_COMBINATION_SELECT_WITH_IMAGES = {
  ...GROUP_VARIANT_COMBINATION_SELECT,
  images: { select: { url: true } },
} as const;

export async function getProduct(id: string, storeId: string) {
  const access = await requireStoreRead(storeId);
  // Acotado a la tienda: un id de otra tienda (o inexistente) devuelve null y
  // la página responde 404 en vez de pintar el formulario de creación.
  const product =
    id === NEW_PRODUCT_SEGMENT
      ? null
      : await prismadb.product.findFirst({
          where: {
            id,
            storeId,
          },
          include: {
            images: { orderBy: GALLERY_ORDER },
            reviews: true,
            catalogOptionValues: {
              include: { option: true, optionValue: true },
            },
            kitComponents: {
              include: {
                component: {
                  include: {
                    images: true,
                    category: true,
                    size: true,
                    color: true,
                    design: true,
                  },
                },
              },
            },
          },
        });
  // Ofertas vigentes: el asistente «Convertir en variantes» ofrece copiarlas
  // a las opciones nuevas. Consulta aparte por la misma razón que la preventa.
  const activeOffers = product
    ? await prismadb.offerProduct.findMany({
        where: {
          productId: product.id,
          offer: { storeId, isActive: true, endDate: { gte: new Date() } },
        },
        select: { offer: { select: { id: true, name: true } } },
      })
    : [];

  // Preventa activa del producto, si la hay. Va como consulta aparte a
  // propósito: meterla en el `include` de arriba cambiaría el tipo de
  // `product` y eso se propaga por todo el formulario.
  const activePresale = product
    ? await prismadb.productPresale.findFirst({
        where: {
          productId: product.id,
          storeId,
          status: ProductPresaleStatus.ACTIVE,
        },
        select: {
          id: true,
          expectedArrivalAt: true,
          expectedArrivalText: true,
          paymentMode: true,
          depositType: true,
          depositValue: true,
          termsText: true,
          balanceDueDays: true,
          unitLimit: true,
          committedUnits: true,
        },
      })
    : null;

  // Los formularios solo ofrecen atributos activos, pero conservan el que el
  // producto ya tiene aunque esté archivado para no romper la edición. Las
  // consultas no dependen entre sí: van en paralelo.
  const [
    categories,
    types,
    sizes,
    colors,
    designs,
    suppliers,
    catalogOptions,
    productGroups,
  ] = await Promise.all([
    prismadb.category.findMany({
      where: { storeId, ...activeOrCurrentWhere(product?.categoryId) },
      include: { type: true },
    }),
    prismadb.type.findMany({
      where: { storeId, ...ACTIVE_ATTRIBUTE_WHERE },
      orderBy: { name: "asc" },
    }),
    prismadb.size.findMany({
      where: { storeId, ...activeOrCurrentWhere(product?.sizeId) },
    }),
    prismadb.color.findMany({
      where: { storeId, ...activeOrCurrentWhere(product?.colorId) },
    }),
    prismadb.design.findMany({
      where: { storeId, ...activeOrCurrentWhere(product?.designId) },
    }),
    prismadb.supplier.findMany({
      where: { storeId },
      select: SUPPLIER_PICKER_SELECT,
    }),
    prismadb.catalogOption.findMany({
      where: { storeId },
      orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        isActive: true,
        categories: {
          orderBy: { displayOrder: "asc" },
          select: { categoryId: true },
        },
        values: {
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            value: true,
            _count: { select: { productValues: true } },
          },
        },
        _count: { select: { productValues: true } },
      },
    }),
    // Grupos para el selector. Las variantes de otro grupo se piden al elegirlo
    // (`product-groups/[id]/combinations`); las del grupo actual llegan abajo.
    prismadb.productGroup.findMany({
      where: { storeId },
      select: {
        id: true,
        name: true,
        brandId: true,
        brandRef: { select: { name: true, logoUrl: true } },
      },
    }),
  ]);

  const mappedReviews =
    product?.reviews.map((review) => ({
      id: review.id,
      productId: review.productId,
      name: review.name,
      userId: review.userId,
      rating: String(review.rating),
      comment: review.comment || "",
      status: review.status,
      reply: review.reply,
      createdAt: format(review.createdAt, "dd 'de' MMMM 'de' yyyy", {
        locale: es,
      }),
    })) || [];

  let productGroup = null;
  if (product?.productGroupId) {
    productGroup = await prismadb.productGroup.findFirst({
      where: {
        id: product.productGroupId,
        storeId,
      },
      // Lo que usa la ficha: la galería del grupo, qué fotos ya tiene cada
      // variante y su combinación (aviso de variante repetida y subcategoría).
      select: {
        id: true,
        images: { select: { url: true } },
        products: { select: GROUP_VARIANT_COMBINATION_SELECT_WITH_IMAGES, orderBy: { createdAt: "asc" } },
      },
    });
  }

  // Las medianas salen de los costos: solo lectura no las recibe.
  const markups = access.role === "viewer" ? null : await loadMarkupMap(prismadb, storeId);
  const brands = await loadBrandOptions(storeId, [product?.brandId]);

  const isViewer = access.role === "viewer";
  // Solo lectura: las reseñas sin quién escribió ni la moderación.
  const reviews = isViewer ? scrubReviews(mappedReviews) : mappedReviews;
  // El margen mínimo de la tienda sale de los costos: solo lectura no lo recibe.
  const storeMinMarginPercent = isViewer
    ? null
    : ((await prismadb.store.findUnique({ where: { id: storeId }, select: { storeMinMarginPercent: true } }))?.storeMinMarginPercent ?? null);

  return {
    // Solo lectura: la ficha se ve sin costo de compra, transporte ni proveedor.
    product: isViewer ? scrubProduct(product) : product,
    storeMinMarginPercent,
    markups,
    activeOffers: activeOffers.map((row) => row.offer),
    activePresale: activePresale
      ? {
          id: activePresale.id,
          expectedArrivalAt: activePresale.expectedArrivalAt?.toISOString() ?? null,
          expectedArrivalText: activePresale.expectedArrivalText,
          unitLimit: activePresale.unitLimit,
          committedUnits: activePresale.committedUnits,
          paymentMode: activePresale.paymentMode,
          depositType: activePresale.depositType,
          depositValue: activePresale.depositValue,
          termsText: activePresale.termsText,
          balanceDueDays: activePresale.balanceDueDays,
        }
      : null,
    categories,
    types,
    sizes,
    colors,
    designs,
    suppliers,
    catalogOptions: catalogOptions.map((option) => ({
      id: option.id,
      key: option.key,
      name: option.name,
      isActive: option.isActive,
      categoryIds: option.categories.map((category) => category.categoryId),
      usageCount: option._count.productValues,
      values: option.values.map((value) => ({
        id: value.id,
        name: value.name,
        value: value.value,
        usageCount: value._count.productValues,
      })),
    })),
    reviews,
    productGroup,
    productGroups,
    brands,
  };
}

/**
 * «Duplicar»: los datos del original para sembrar el formulario de creación.
 * Sin fotos (las variantes comparten archivos por URL y borrar en una rompería
 * la otra), sin SKU, sin GTIN ni MPN, sin stock, sin grupo y sin envío por unidad.
 */
export async function getProductSeed(storeId: string, sourceId: string) {
  const access = await requireStoreRead(storeId);
  // Duplicar es crear: la cuenta de solo lectura no puede, y la copia traería
  // costo, proveedor y piezas del kit con sus costos.
  if (access.role !== "owner") throw ErrorFactory.Unauthorized();
  const source = await prismadb.product.findFirst({
    where: { id: sourceId, storeId },
    include: {
      brandRef: { select: { isArchived: true } },
      catalogOptionValues: { include: { option: true, optionValue: true } },
      kitComponents: {
        include: {
          component: {
            include: {
              images: true,
              category: true,
              size: true,
              color: true,
              design: true,
            },
          },
        },
      },
    },
  });
  if (!source) return null;
  return {
    id: source.id,
    name: `${source.name} (copia)`,
    description: source.description,
    price: source.price,
    acqPrice: source.acqPrice,
    // El envío por unidad es de cada compra, no del producto: la copia nace «no registrado».
    transportationCost: null,
    categoryId: source.categoryId,
    colorId: source.colorId,
    sizeId: source.sizeId,
    designId: source.designId,
    supplierId: source.supplierId,
    // Una marca archivada no se puede poner en un producto nuevo.
    brandId: source.brandRef && !source.brandRef.isArchived ? source.brandId : null,
    isKit: source.isKit,
    kitComponents: source.kitComponents,
    catalogOptionValues: source.catalogOptionValues,
    sourceName: source.name,
  };
}
