"use server";

import { SUPPLIER_PICKER_SELECT } from "@/lib/public-catalog";
import { requireStoreRead } from "@/lib/store-access";

import { ProductPresaleStatus } from "@prisma/client";
import {
  ACTIVE_ATTRIBUTE_WHERE,
  activeOrCurrentWhere,
} from "@/lib/attribute-archive";
import prismadb from "@/lib/prismadb";
import { scrubProduct } from "@/lib/viewer-payloads";
import { NEW_PRODUCT_SEGMENT } from "@/lib/product-routes";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
            images: { orderBy: [{ isMain: "desc" }, { createdAt: "asc" }] },
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
    // Grupos para el selector y la detección de colisiones de variantes.
    prismadb.productGroup.findMany({
      where: { storeId },
      select: {
        id: true,
        name: true,
        products: {
          select: {
            id: true,
            categoryId: true,
            designId: true,
            colorId: true,
            sizeId: true,
            price: true,
          },
        },
      },
    }),
  ]);

  const reviews =
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
      include: {
        images: true,
        products: {
          include: {
            images: true,
          },
        },
      },
    });
  }

  return {
    // Solo lectura: la ficha se ve sin costo de compra, transporte ni proveedor.
    product: access.role === "viewer" ? scrubProduct(product) : product,
    activeOffers: activeOffers.map((row) => row.offer),
    activePresale: activePresale
      ? {
          id: activePresale.id,
          expectedArrivalAt: activePresale.expectedArrivalAt.toISOString(),
          unitLimit: activePresale.unitLimit,
          committedUnits: activePresale.committedUnits,
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
  };
}

/**
 * «Duplicar»: los datos del original para sembrar el formulario de creación.
 * Sin fotos (las variantes comparten archivos por URL y borrar en una rompería
 * la otra), sin SKU, sin GTIN ni MPN, sin stock y sin grupo.
 */
export async function getProductSeed(storeId: string, sourceId: string) {
  const access = await requireStoreRead(storeId);
  const source = await prismadb.product.findFirst({
    where: { id: sourceId, storeId },
    include: {
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
    transportationCost: source.transportationCost,
    categoryId: source.categoryId,
    colorId: source.colorId,
    sizeId: source.sizeId,
    designId: source.designId,
    supplierId: source.supplierId,
    brand: source.brand,
    isKit: source.isKit,
    kitComponents: source.kitComponents,
    catalogOptionValues: source.catalogOptionValues,
    sourceName: source.name,
  };
}
