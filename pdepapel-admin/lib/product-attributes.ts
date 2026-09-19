import { Prisma, PrismaClient } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";

type AttributeClient = PrismaClient | Prisma.TransactionClient;

/**
 * Carga la subcategoría, el diseño, el color y el tamaño de un producto
 * acotados a la tienda. Antes las rutas de producto los buscaban solo por id,
 * así que un id de otra tienda se colgaba del producto sin aviso (los grupos
 * ya lo impedían con `loadVariantAttributes`).
 */
export async function loadProductAttributes(
  db: AttributeClient,
  params: { storeId: string; categoryId: string; designId: string; colorId: string; sizeId: string },
) {
  const { storeId } = params;
  const [category, design, color, size] = await Promise.all([
    db.category.findFirst({ where: { id: params.categoryId, storeId } }),
    db.design.findFirst({ where: { id: params.designId, storeId } }),
    db.color.findFirst({ where: { id: params.colorId, storeId } }),
    db.size.findFirst({ where: { id: params.sizeId, storeId } }),
  ]);
  const missing = [
    !category && "la subcategoría",
    !design && "el diseño",
    !color && "el color",
    !size && "el tamaño",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw ErrorFactory.InvalidRequest(`El producto usa ${missing.join(", ")} de otra tienda o que ya no existe.`);
  }
  return { category: category!, design: design!, color: color!, size: size! };
}
