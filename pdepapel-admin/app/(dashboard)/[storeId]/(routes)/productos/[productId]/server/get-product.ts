"use server";

import { ACTIVE_ATTRIBUTE_WHERE, activeOrCurrentWhere } from "@/lib/attribute-archive";
import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getProduct(id: string, storeId: string) {
  const product = await prismadb.product.findUnique({
    where: {
      id,
    },
    include: {
      images: true,
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
  // Los formularios solo ofrecen atributos activos, pero conservan el que el
  // producto ya tiene aunque esté archivado para no romper la edición.
  const categories = await prismadb.category.findMany({
    where: {
      storeId,
      ...activeOrCurrentWhere(product?.categoryId),
    },
    include: {
      type: true,
    },
  });
  const types = await prismadb.type.findMany({
    where: { storeId, ...ACTIVE_ATTRIBUTE_WHERE },
    orderBy: { name: "asc" },
  });
  const sizes = await prismadb.size.findMany({
    where: {
      storeId,
      ...activeOrCurrentWhere(product?.sizeId),
    },
  });
  const colors = await prismadb.color.findMany({
    where: {
      storeId,
      ...activeOrCurrentWhere(product?.colorId),
    },
  });
  const designs = await prismadb.design.findMany({
    where: {
      storeId,
      ...activeOrCurrentWhere(product?.designId),
    },
  });
  const suppliers = await prismadb.supplier.findMany({
    where: {
      storeId,
    },
  });
  const catalogOptions = await prismadb.catalogOption.findMany({
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
  });

  // Fetch all product groups for selection in the form
  // We include products to check for existing variants (collision detection)
  const productGroups = await prismadb.productGroup.findMany({
    where: {
      storeId,
    },
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
  });

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
    productGroup = await prismadb.productGroup.findUnique({
      where: {
        id: product.productGroupId,
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
    product,
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
