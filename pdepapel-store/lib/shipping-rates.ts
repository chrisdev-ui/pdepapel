import { ShippingQuote } from "@/types";

export type ShippingRateBadge = "cheapest" | "fastest";

export interface GroupedShippingQuote extends ShippingQuote {
  badges: ShippingRateBadge[];
  /** How many raw quotes from the same carrier this one replaced. */
  hiddenAlternatives: number;
}

const toDays = (value: ShippingQuote["deliveryDays"]): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

/**
 * EnvioClick returns the same carrier twice when it can ship with and without
 * cash on delivery, often at the same price. Customers only need one row per
 * carrier: keep the cheapest, and when the COD variant costs the same prefer
 * it (it leaves «contra entrega» available in the payment step). When the
 * cheapest row of a carrier does not collect but a COD variant exists, that
 * variant stays as its own row: grouping never hides a carrier's only way to
 * pay on delivery (2026-10-15).
 */
const isBetter = (quote: ShippingQuote, current: ShippingQuote) =>
  quote.totalCost < current.totalCost ||
  (quote.totalCost === current.totalCost && quote.isCOD && !current.isCOD) ||
  (quote.totalCost === current.totalCost &&
    quote.isCOD === current.isCOD &&
    toDays(quote.deliveryDays) < toDays(current.deliveryDays));

export function groupShippingQuotes(
  quotes: ShippingQuote[] | null | undefined,
): GroupedShippingQuote[] {
  if (!quotes || quotes.length === 0) return [];

  const byCarrier = new Map<string, { best: ShippingQuote; bestCod: ShippingQuote | null; count: number }>();

  for (const quote of quotes) {
    const key = `${quote.carrier}`.trim().toUpperCase();
    const current = byCarrier.get(key);
    if (!current) {
      byCarrier.set(key, { best: quote, bestCod: quote.isCOD ? quote : null, count: 1 });
      continue;
    }

    current.count += 1;
    if (isBetter(quote, current.best)) current.best = quote;
    if (quote.isCOD && (!current.bestCod || isBetter(quote, current.bestCod))) current.bestCod = quote;
  }

  const rows = Array.from(byCarrier.values()).flatMap(({ best, bestCod, count }) => {
    const kept = bestCod && !best.isCOD ? [best, bestCod] : [best];
    return kept.map((quote) => ({ quote, hidden: count - kept.length }));
  });

  const grouped = rows
    .map(({ quote, hidden }) => ({
      ...quote,
      badges: [] as ShippingRateBadge[],
      hiddenAlternatives: hidden,
    }))
    .sort((a, b) => a.totalCost - b.totalCost);

  if (grouped.length > 1) {
    grouped[0].badges.push("cheapest");
    const fastest = grouped.reduce((winner, quote) =>
      toDays(quote.deliveryDays) < toDays(winner.deliveryDays) ? quote : winner,
    );
    if (fastest !== grouped[0]) fastest.badges.push("fastest");
  }

  return grouped;
}

/** Identity of a quote request; when it changes the stored quotes are stale. */
export function getShippingQuoteKey(input: {
  daneCode: string;
  address: string;
  orderTotal: number;
  items: { productId: string; quantity: number }[];
}): string {
  const items = [...input.items]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map((item) => `${item.productId}x${item.quantity}`)
    .join(",");
  return [
    input.daneCode.trim(),
    input.address.trim().toLowerCase(),
    Math.round(input.orderTotal),
    items,
  ].join("|");
}

/** Quotes older than this are refreshed instead of reused. */
export const SHIPPING_QUOTE_MAX_AGE_MS = 30 * 60 * 1000;

export function isShippingQuoteFresh(
  fetchedAt: number | null | undefined,
  now = Date.now(),
): boolean {
  if (!fetchedAt) return false;
  return now - fetchedAt < SHIPPING_QUOTE_MAX_AGE_MS;
}
