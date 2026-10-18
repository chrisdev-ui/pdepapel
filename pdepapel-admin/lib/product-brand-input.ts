import type { Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";

type BrandLookupClient = Pick<Prisma.TransactionClient, "brand">;

/**
 * `brandId` del cuerpo de un guardado: `undefined` = no vino (no se toca),
 * `null` = «Sin marca», texto = la marca elegida.
 */
export function readBrandIdInput(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "" || value === "none") return null;
  if (typeof value !== "string") throw ErrorFactory.InvalidRequest("La marca no es válida");
  return value;
}

/**
 * La marca tiene que ser de la tienda y no estar archivada. Una archivada que
 * el producto o el grupo ya tenía puede quedarse: guardar otro campo no obliga
 * a cambiarle la marca.
 */
export async function assertAssignableBrand(
  db: BrandLookupClient,
  storeId: string,
  brandId: string | null | undefined,
  options: { currentBrandId?: string | null } = {},
) {
  if (!brandId) return;
  const brand = await db.brand.findFirst({
    where: { id: brandId, storeId },
    select: { name: true, isArchived: true },
  });
  if (!brand) throw ErrorFactory.NotFound("Marca no encontrada");
  if (brand.isArchived && brandId !== options.currentBrandId) {
    throw ErrorFactory.Conflict(`La marca «${brand.name}» está archivada: elige otra o desarchívala en Marcas.`);
  }
}
