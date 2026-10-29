import { ProductPresaleStatus } from "@prisma/client";

/**
 * Una preventa en los feeds de Google y Meta (Pinterest lee el de Meta):
 * con fecha va como `preorder` con `availability_date`; sin fecha («por
 * confirmar») el producto no sale, porque un feed no sabe decir «por
 * confirmar» y «agotado» desperdicia la publicación. El precio sigue siendo el
 * completo, nunca el anticipo.
 */
export const PRESALE_FEED_INCLUDE = {
  presales: {
    where: { status: ProductPresaleStatus.ACTIVE },
    select: { expectedArrivalAt: true },
    take: 1,
  },
} as const;

export type PresaleFeedDecision = { kind: "none" } | { kind: "skip" } | { kind: "preorder"; availabilityDate: string };

function bogotaDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(date);
}

export function presaleFeedDecision(product: { presales?: { expectedArrivalAt: Date | null }[] }): PresaleFeedDecision {
  const presale = product.presales?.[0];
  if (!presale) return { kind: "none" };
  if (!presale.expectedArrivalAt) return { kind: "skip" };
  return { kind: "preorder", availabilityDate: `${bogotaDay(presale.expectedArrivalAt)}T00:00-05:00` };
}
