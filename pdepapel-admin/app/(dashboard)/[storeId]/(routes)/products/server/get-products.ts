"use server";

import prismadb from "@/lib/prismadb";
import { currencyFormatter, numberFormatter } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getProducts(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId,
    },
    include: {
      category: true,
      size: true,
      color: true,
      design: true,
      images: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return products.map((product) => ({
    id: product.id,
    sku: product.sku,
    image:
      product.images.find((image) => image.isMain)?.url ??
      product.images[0]?.url ??
      "https://placehold.co/400",
    name: product.name,
    isFeatured: product.isFeatured,
    isArchived: product.isArchived,
    stock: numberFormatter.format(product.stock),
    price: currencyFormatter.format(product.price),
    category: product.category.name,
    size: product.size.name,
    color: product.color.value,
    design: product.design.name,
    createdAt: format(product.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
