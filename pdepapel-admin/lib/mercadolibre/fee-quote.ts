import "server-only";

import { requestMercadoLibreJson } from "@/lib/mercadolibre/client";
import { parseMercadoLibreListingPriceEstimate } from "@/lib/mercadolibre/listing-pricing";
import { feeSourceFromQuote, type SaleFeeSource } from "@/lib/pricing/mercadolibre-fees";

const QUOTE_TIMEOUT_MS = 3_000;
/** Tope de toda la consulta (un 429 de Mercado Libre espera y reintenta): después, el estimado. */
const QUOTE_BUDGET_MS = 4_500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; source: SaleFeeSource | null }>();

export interface FeeQuoteRequest {
  connectionId: string;
  siteId: string;
  categoryId: string;
  listingType: string;
  price: number;
}

export type FeeQuoter = (request: FeeQuoteRequest) => Promise<SaleFeeSource | null>;

const quoteFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) });

/**
 * La comisión exacta de Mercado Libre para un precio, categoría y tipo de
 * publicación (`/sites/{site}/listing_prices`), con el token de la tienda.
 * Solo lectura: usa `requestMercadoLibreJson`, que no marca la conexión con
 * error (una pregunta del Copiloto no puede dejarla «fallando»). Guarda el
 * resultado 6 horas en memoria y, ante cualquier falla o demora, devuelve null
 * para que quien llama use el estimado del tipo de publicación.
 */
export const quoteMercadoLibreSaleFee: FeeQuoter = async (request) => {
  const key = `${request.siteId}|${request.categoryId}|${request.listingType}|${Math.round(request.price)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.source;
  const path = `/sites/${encodeURIComponent(request.siteId)}/listing_prices?price=${Math.round(request.price)}&category_id=${encodeURIComponent(request.categoryId)}&listing_type_id=${encodeURIComponent(request.listingType)}`;
  try {
    const result = await Promise.race([
      requestMercadoLibreJson(request.connectionId, path, quoteFetch),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), QUOTE_BUDGET_MS)),
    ]);
    const source = result && result.ok ? feeSourceFromQuote(parseMercadoLibreListingPriceEstimate(result.payload)) : null;
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    if (source) cache.set(key, { at: Date.now(), source });
    return source;
  } catch (error) {
    console.warn("[ML_FEE_QUOTE]", error instanceof Error ? error.message.slice(0, 120) : "error");
    return null;
  }
};
