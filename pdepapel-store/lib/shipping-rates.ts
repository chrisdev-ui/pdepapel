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
 * it (it leaves «contra entrega» available in the payment step).
 */
export function groupShippingQuotes(
  quotes: ShippingQuote[] | null | undefined,
): GroupedShippingQuote[] {
  if (!quotes || quotes.length === 0) return [];

  const byCarrier = new Map<string, { best: ShippingQuote; count: number }>();

  for (const quote of quotes) {
    const key = `${quote.carrier}`.trim().toUpperCase();
    const current = byCarrier.get(key);
    if (!current) {
      byCarrier.set(key, { best: quote, count: 1 });
      continue;
    }

    current.count += 1;
    const cheaper = quote.totalCost < current.best.totalCost;
    const samePriceButCod =
      quote.totalCost === current.best.totalCost &&
      quote.isCOD &&
      !current.best.isCOD;
    const samePriceButFaster =
      quote.totalCost === current.best.totalCost &&
      quote.isCOD === current.best.isCOD &&
      toDays(quote.deliveryDays) < toDays(current.best.deliveryDays);

    if (cheaper || samePriceButCod || samePriceButFaster) {
      current.best = quote;
    }
  }

  const grouped = Array.from(byCarrier.values())
    .map(({ best, count }) => ({
      ...best,
      badges: [] as ShippingRateBadge[],
      hiddenAlternatives: count - 1,
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
