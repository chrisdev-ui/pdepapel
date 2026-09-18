import type { Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import {
  variantAttributeIds,
  variantLabel,
  type VariantPayload,
} from "@/lib/product-group-save";

type AttributeClient = Pick<
  Prisma.TransactionClient,
  "color" | "design" | "size" | "category"
>;

/**
 * Los atributos de todas las variantes en tres consultas (antes eran tres
 * por fila dentro de la transacción) y filtrados por tienda: un id de otra
 * tienda no puede colarse en una variante.
 */
export async function loadVariantAttributes(
  db: AttributeClient,
  storeId: string,
  variants: VariantPayload[],
) {
  const ids = variants.map((variant) => variantAttributeIds(variant));
  const unique = (key: "sizeId" | "colorId" | "designId") =>
    Array.from(new Set(ids.map((row) => row[key]).filter(Boolean) as string[]));

  const [colors, designs, sizes] = await Promise.all([
    db.color.findMany({ where: { storeId, id: { in: unique("colorId") } } }),
    db.design.findMany({ where: { storeId, id: { in: unique("designId") } } }),
    db.size.findMany({ where: { storeId, id: { in: unique("sizeId") } } }),
  ]);
  const colorById = new Map(colors.map((row) => [row.id, row]));
  const designById = new Map(designs.map((row) => [row.id, row]));
  const sizeById = new Map(sizes.map((row) => [row.id, row]));

  return {
    resolve(
      attributeIds: { sizeId: string; colorId: string; designId: string },
      variant: VariantPayload,
    ) {
      const colorObj = colorById.get(attributeIds.colorId);
      const designObj = designById.get(attributeIds.designId);
      const sizeObj = sizeById.get(attributeIds.sizeId);
      const missing = [
        !colorObj && "el color",
        !designObj && "el diseño",
        !sizeObj && "el tamaño",
      ].filter(Boolean);
      if (missing.length > 0) {
        throw ErrorFactory.InvalidRequest(
          `La variante «${variantLabel(variant)}» usa ${missing.join(", ")} de otra tienda o que ya no existe.`,
        );
      }
      return { colorObj: colorObj!, designObj: designObj!, sizeObj: sizeObj! };
    },
    categoryFallback() {
      throw ErrorFactory.InvalidRequest(
        "La subcategoría del grupo es obligatoria para crear variantes nuevas.",
      );
    },
  };
}

/** La subcategoría del grupo tiene que ser de la tienda. */
export async function assertStoreCategory(
  db: Pick<Prisma.TransactionClient, "category">,
  storeId: string,
  categoryId: string | undefined,
) {
  if (!categoryId) return;
  const category = await db.category.findFirst({
    where: { id: categoryId, storeId },
    select: { id: true },
  });
  if (!category) {
    throw ErrorFactory.InvalidRequest(
      "La subcategoría elegida no pertenece a esta tienda.",
    );
  }
}
