import { CapsuleSlipKind, CapsuleSlipStatus, Prisma } from "@prisma/client";

import { parseSizeValue } from "@/constants/sizes";
import { suggestCapsuleBox } from "@/lib/capsule-box";
import { type BoxConfiguration, calculatePackageDimensions, getBoxConfigurations } from "@/lib/package-calculator";

/**
 * El paquete para cotizar un carrito con cápsulas: no se sabe qué va a salir,
 * así que se cotiza el peor caso. Cada cápsula cuenta como el producto más
 * grande (y más pesado) de la bolsa de su edición, y la caja es la que ese
 * pack podría necesitar (`suggestCapsuleBox` con la cantidad total). Siempre
 * caja, nunca bolsa. Sin cápsulas en el carrito devuelve null.
 */
const DIMENSIONS = ["XS", "S", "M", "L", "XL"];
const sizeRank = (value: string | null | undefined) => {
  const parsed = value ? parseSizeValue(value) : null;
  if (!parsed) return -1;
  return DIMENSIONS.indexOf(parsed.dimension) * 2 + (parsed.weight === "P" ? 1 : 0);
};

type QuoteItem = { productId: string; quantity: number };
type QuoteProduct = { id: string; name: string; size?: { name: string; value: string } | null };
type QuoteDb = Pick<Prisma.TransactionClient, "capsuleEdition" | "capsuleSlip">;

export async function capsulePackageFor(db: QuoteDb, items: readonly QuoteItem[], products: readonly QuoteProduct[], boxConfigurations: Record<string, BoxConfiguration>) {
  const editions = await db.capsuleEdition.findMany({ where: { productId: { in: products.map((product) => product.id) } }, select: { id: true, productId: true } });
  if (editions.length === 0) return null;
  const pool = await db.capsuleSlip.findMany({
    where: { editionId: { in: editions.map((edition) => edition.id) }, kind: CapsuleSlipKind.SLIP, status: CapsuleSlipStatus.PRINTED },
    distinct: ["editionId", "productId"],
    select: { editionId: true, product: { select: { size: { select: { name: true, value: true } } } } },
  });
  const largestByEdition = new Map<string, { name: string; value: string } | null>();
  for (const row of pool) {
    const current = largestByEdition.get(row.editionId) ?? null;
    if (sizeRank(row.product.size?.value) > sizeRank(current?.value)) largestByEdition.set(row.editionId, row.product.size);
  }
  const editionByProduct = new Map(editions.map((edition) => [edition.productId, edition.id]));

  // Cada cápsula se pesa y se mide como el producto más grande de su bolsa; lo demás del carrito, como es.
  const worstProducts = products.map((product) => {
    const editionId = editionByProduct.get(product.id);
    return editionId ? { ...product, size: largestByEdition.get(editionId) ?? null } : product;
  });
  const weight = calculatePackageDimensions([...items], worstProducts).weight;
  const totalItems = items.reduce((total, item) => total + item.quantity, 0);
  const sizes = items.map((item) => worstProducts.find((product) => product.id === item.productId)?.size?.value ?? null);
  const { type } = suggestCapsuleBox(sizes, [], totalItems);
  const fallback = getBoxConfigurations() as Record<string, Omit<BoxConfiguration, "type"> & { type: string }>;
  const box = boxConfigurations[type] ?? fallback[type] ?? fallback.L;
  return { width: Number(box.width), height: Number(box.height), length: Number(box.length), type: "box" as const, size: type as "XS" | "S" | "M" | "L" | "XL", weight };
}
