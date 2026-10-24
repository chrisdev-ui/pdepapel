/**
 * El cargador de «Margen bajo» (Productos, solo la dueña). Lee una fila
 * liviana por producto sin archivar, la clasifica con `lib/pricing/low-margin`
 * y devuelve los conteos de cada sección y solo la página pedida.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { pickBestOffer, type ActiveOffer } from "@/lib/offer-pricing";
import {
  LOW_MARGIN_SECTIONS,
  classifyLowMargin,
  compareLowMargin,
  sectionOf,
  type LowMarginRow,
  type LowMarginSection,
} from "@/lib/pricing/low-margin";
import { landedCost } from "@/lib/pricing/price-calculator";

export const LOW_MARGIN_PAGE_SIZE = 50;

export interface LowMarginQuery {
  section: LowMarginSection | null;
  page: number;
}

const LOW_MARGIN_SELECT = {
  id: true,
  name: true,
  price: true,
  acqPrice: true,
  transportationCost: true,
  isKit: true,
  categoryId: true,
  productGroupId: true,
  category: { select: { name: true } },
  kitComponents: { select: { quantity: true, component: { select: { acqPrice: true, transportationCost: true } } } },
} satisfies Prisma.ProductSelect;

type LowMarginProduct = Prisma.ProductGetPayload<{ select: typeof LOW_MARGIN_SELECT }>;

export function isLowMarginSection(value: unknown): value is LowMarginSection {
  return typeof value === "string" && (LOW_MARGIN_SECTIONS as readonly string[]).includes(value);
}

export function parseLowMarginQuery(searchParams: Record<string, string | string[] | undefined>): LowMarginQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const section = first(searchParams.seccion);
  const page = Number.parseInt(first(searchParams.pagina) ?? "", 10);
  return { section: isLowMarginSection(section) ? section : null, page: Number.isFinite(page) && page > 0 ? page : 1 };
}

/** El costo de un kit es la suma de sus piezas; sin el costo de una pieza, no hay costo. Sin piezas, el de su ficha. */
export function productUnitCost(product: Pick<LowMarginProduct, "isKit" | "acqPrice" | "transportationCost" | "kitComponents">): number | null {
  if (!product.isKit || product.kitComponents.length === 0) return landedCost(product.acqPrice, product.transportationCost);
  let total = 0;
  for (const piece of product.kitComponents) {
    const cost = landedCost(piece.component.acqPrice, piece.component.transportationCost);
    if (cost === null) return null;
    total += cost * piece.quantity;
  }
  return total;
}

export async function loadLowMargin(db: Pick<PrismaClient, "product" | "store">, storeId: string, query: LowMarginQuery, offers: readonly ActiveOffer[]) {
  const [store, products] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { storeMinMarginPercent: true } }),
    db.product.findMany({ where: { storeId, isArchived: false }, select: LOW_MARGIN_SELECT }),
  ]);
  const minimoPct = store?.storeMinMarginPercent ?? null;

  const bySection = new Map<LowMarginSection, LowMarginRow[]>(LOW_MARGIN_SECTIONS.map((section) => [section, []]));
  let sinCosto = 0;
  for (const product of products) {
    const best = pickBestOffer(product, offers);
    const row = classifyLowMargin(
      {
        id: product.id,
        name: product.name,
        categoryName: product.category?.name ?? null,
        price: product.price,
        effectivePrice: best.price,
        offerLabel: best.offerLabel,
        cost: productUnitCost(product),
        isKit: product.isKit,
      },
      minimoPct,
    );
    if (row.clase === "sin-costo" && !row.esKit) sinCosto += 1;
    const section = sectionOf(row);
    if (section) bySection.get(section)!.push(row);
  }

  const counts = Object.fromEntries(LOW_MARGIN_SECTIONS.map((section) => [section, bySection.get(section)!.length])) as Record<LowMarginSection, number>;
  // «Solo por Bold» va plegado: nunca es la sección que se abre sola.
  const section = query.section ?? LOW_MARGIN_SECTIONS.find((candidate) => candidate !== "solo-bold" && counts[candidate] > 0) ?? null;
  const rows = section ? [...bySection.get(section)!].sort(compareLowMargin) : [];
  const pageCount = Math.max(1, Math.ceil(rows.length / LOW_MARGIN_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);

  return {
    minimoPct,
    evaluados: products.length,
    sinCosto,
    counts,
    section,
    total: rows.length,
    page,
    pageCount,
    pageSize: LOW_MARGIN_PAGE_SIZE,
    rows: rows.slice((page - 1) * LOW_MARGIN_PAGE_SIZE, page * LOW_MARGIN_PAGE_SIZE),
  };
}

export type LowMarginPage = Awaited<ReturnType<typeof loadLowMargin>>;
