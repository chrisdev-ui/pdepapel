import { SHIPPING_QUOTE_CACHE } from "@/constants/shipping";

import type { ShippingQuote } from "../schema";

export const QUOTE_TTL_MS = SHIPPING_QUOTE_CACHE.TTL_MS;

/** Tarifas ordenadas por precio; `primary` = la más barata de cada transportadora. */
export function groupQuotes(quotes: ShippingQuote[]) {
  const sorted = [...quotes].sort((a, b) => a.totalCost - b.totalCost);
  const seen = new Set<string>();
  const primary: ShippingQuote[] = [];
  const rest: ShippingQuote[] = [];
  for (const quote of sorted) {
    if (seen.has(quote.carrier)) rest.push(quote);
    else {
      seen.add(quote.carrier);
      primary.push(quote);
    }
  }
  return { primary, rest };
}

export function formatRemaining(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${minutes} min`;
}

/** Con qué tarifa se queda una recotización: la de antes si sigue, si no la más barata. */
export function pickAfterRequote(
  quotes: ShippingQuote[],
  previousCarrier: string | null,
): ShippingQuote | undefined {
  const { primary } = groupQuotes(quotes);
  const keep = previousCarrier
    ? primary.find((q) => q.carrier === previousCarrier)
    : undefined;
  return keep ?? primary[0];
}

export type RequoteNotice =
  | { kind: "price"; carrier: string; from: number; to: number }
  | { kind: "carrier"; previous: string; carrier: string; cost: number };

/** Qué le cambió a la clienta una recotización, o null si nada visible. */
export function describeRequote(
  previous: { carrier: string | null; cost: number } | null,
  next: ShippingQuote,
): RequoteNotice | null {
  if (!previous?.carrier) return null;
  if (previous.carrier !== next.carrier) {
    return {
      kind: "carrier",
      previous: previous.carrier,
      carrier: next.carrier,
      cost: next.totalCost,
    };
  }
  if (previous.cost !== next.totalCost) {
    return {
      kind: "price",
      carrier: next.carrier,
      from: previous.cost,
      to: next.totalCost,
    };
  }
  return null;
}
