import { CapsuleEditionStatus, CapsuleSlipKind, CapsuleSlipStatus } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import { suggestCapsuleBox } from "@/lib/capsule-box";
import { capsuleDayStatus } from "@/lib/capsule-day";
import { verifyCapsulePreviewToken } from "@/lib/capsule-preview";
import { CAPSULE_PACK_PRICES, CAPSULE_SALES_ENABLED, capsuleUnitPrice, maxPackFor, packSaving } from "@/lib/pricing/capsules";
import prismadb from "@/lib/prismadb";
import { slugify } from "@/lib/slugify";

/**
 * La edición para la tienda. Con la venta apagada (bandera de lanzamiento)
 * solo se ve con un enlace de vista previa válido para esa edición; con la
 * venta encendida, una edición LIVE se ve sin enlace y una DRAFT o PREVIEW
 * solo con él. Una edición cerrada no se ve nunca.
 *
 * Sin costos, banda, topes de regalo, caja, códigos de papel ni ids de la
 * bolsa: la galería lleva solo nombre e imagen, y de lo que queda solo sale
 * si cada pack está disponible (≤ 25 % de los papeles sin vender).
 */
export function canSeeEdition(status: CapsuleEditionStatus, salesEnabled: boolean, previewValid: boolean): boolean {
  if (status === CapsuleEditionStatus.CLOSED) return false;
  if (previewValid) return true;
  return salesEnabled && status === CapsuleEditionStatus.LIVE;
}

export const editionPathSegment = (edition: { number: number; name: string }) => `${edition.number}-${slugify(edition.name) || "edicion"}`;

const GALLERY_LIMIT = 60;

export async function getPublicCapsuleEdition({
  storeId,
  segment,
  token,
  now = new Date(),
  salesEnabled = CAPSULE_SALES_ENABLED,
}: {
  storeId: string;
  segment: string;
  token?: string | null;
  now?: Date;
  salesEnabled?: boolean;
}) {
  const number = Number.parseInt(segment, 10);
  if (!Number.isInteger(number) || number <= 0) return null;
  const edition = await prismadb.capsuleEdition.findUnique({
    where: { storeId_number: { storeId, number } },
    include: {
      product: { select: { id: true, slug: true, name: true, description: true, stock: true, reservedUnits: true, images: { select: { url: true }, take: 6 } } },
      packOptions: { select: { packSize: true, giftLabel: true } },
    },
  });
  if (!edition) return null;
  const previewValid = verifyCapsulePreviewToken({ storeId, editionId: edition.id }, token, now);
  if (!canSeeEdition(edition.status, salesEnabled, previewValid)) return null;

  const pool = await prismadb.capsuleSlip.groupBy({
    by: ["productId"],
    where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP, status: CapsuleSlipStatus.PRINTED },
  });
  const poolProducts = pool.length
    ? await prismadb.product.findMany({
        where: { id: { in: pool.map((row) => row.productId) } },
        select: { name: true, size: { select: { value: true } }, images: { select: { url: true }, take: 1 } },
        orderBy: { name: "asc" },
      })
    : [];
  // La caja más grande que un pack podría necesitar: el producto más grande de la bolsa y el piso por cantidad.
  const sizeValues = poolProducts.map((product) => product.size?.value ?? null);
  const remaining = availableStock(edition.product);
  const largestPack = maxPackFor(remaining);
  const giftLabel = new Map(edition.packOptions.map((option) => [option.packSize, option.giftLabel]));
  const day = await capsuleDayStatus(prismadb, storeId, edition, now);

  return {
    edition: { number: edition.number, name: edition.name, theme: edition.theme, segment: editionPathSegment(edition), status: edition.status },
    preview: previewValid,
    salesEnabled,
    product: { slug: edition.product.slug, name: edition.product.name, description: edition.product.description, images: edition.product.images.map((image) => image.url) },
    gallery: poolProducts.slice(0, GALLERY_LIMIT).map((product) => ({ name: product.name, imageUrl: product.images[0]?.url ?? null })),
    packs: CAPSULE_PACK_PRICES.map((price) => ({
      packSize: price.packSize,
      total: price.total,
      unitPrice: capsuleUnitPrice(price),
      saving: packSaving(price),
      giftLabel: giftLabel.get(price.packSize) ?? null,
      available: largestPack !== null && price.packSize <= largestPack,
      boxType: suggestCapsuleBox(sizeValues, [], price.packSize).type,
    })),
    day: { cap: day.cap, left: day.left, opensAt: day.opensAt, closedReason: day.closedReason },
  };
}

export type PublicCapsuleEdition = NonNullable<Awaited<ReturnType<typeof getPublicCapsuleEdition>>>;
