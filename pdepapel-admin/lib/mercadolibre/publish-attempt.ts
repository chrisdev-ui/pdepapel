import prismadb from "@/lib/prismadb";

import { getMercadoLibreJson } from "./client";

/**
 * Marca de «publicación en curso» que se guarda ANTES de crear el ítem en
 * Mercado Libre. Si la base falla justo después de que Mercado Libre lo creó,
 * el reintento encuentra la marca, busca el ítem por SKU y lo adopta en vez
 * de crear un segundo.
 */
export interface PublishAttempt {
  startedAt: string;
  sku: string | null;
}

const KEY = "publishAttempt";
/** Margen de reloj entre nuestro servidor y Mercado Libre. */
const CLOCK_SKEW_MS = 2 * 60 * 1000;

type Metadata = Record<string, unknown>;

const asRecord = (metadata: unknown): Metadata =>
  metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Metadata) : {};

export function readPublishAttempt(metadata: unknown): PublishAttempt | null {
  const attempt = asRecord(metadata)[KEY];
  if (!attempt || typeof attempt !== "object") return null;
  const record = attempt as Metadata;
  return typeof record.startedAt === "string"
    ? { startedAt: record.startedAt, sku: typeof record.sku === "string" && record.sku ? record.sku : null }
    : null;
}

export function withPublishAttempt(metadata: unknown, attempt: PublishAttempt | null): Metadata {
  const { [KEY]: _previous, ...rest } = asRecord(metadata);
  return attempt ? { ...rest, [KEY]: attempt } : rest;
}

export interface AdoptedItem {
  id: string;
  permalink: string | null;
  status: string | null;
}

/**
 * El ítem que creó un intento anterior: mismo SKU y creado después de que
 * empezó el intento. Un ítem viejo con el mismo SKU (otra publicación) no cuenta.
 */
export async function findItemFromAttempt(connectionId: string, attempt: PublishAttempt): Promise<AdoptedItem | null> {
  if (!attempt.sku) return null;
  const connection = await prismadb.marketplaceConnection.findUnique({ where: { id: connectionId }, select: { sellerId: true } });
  if (!connection?.sellerId) return null;

  const ids = new Set<string>();
  for (const param of ["seller_sku", "sku"]) {
    const search = (await getMercadoLibreJson(
      connectionId,
      `/users/${encodeURIComponent(connection.sellerId)}/items/search?${param}=${encodeURIComponent(attempt.sku)}`,
    )) as { results?: unknown };
    if (Array.isArray(search?.results)) for (const id of search.results) if (typeof id === "string") ids.add(id);
  }
  if (!ids.size) return null;

  const items = (await getMercadoLibreJson(
    connectionId,
    `/items?ids=${Array.from(ids).slice(0, 20).map(encodeURIComponent).join(",")}&attributes=id,permalink,status,date_created`,
  )) as unknown;
  const startedAt = new Date(attempt.startedAt).getTime() - CLOCK_SKEW_MS;
  const candidates = (Array.isArray(items) ? items : [])
    .map((entry) => asRecord(asRecord(entry).body))
    .filter((body) => typeof body.id === "string" && new Date(String(body.date_created ?? 0)).getTime() >= startedAt)
    .sort((a, b) => new Date(String(a.date_created)).getTime() - new Date(String(b.date_created)).getTime());
  const item = candidates[0];
  return item
    ? { id: String(item.id), permalink: typeof item.permalink === "string" ? item.permalink : null, status: typeof item.status === "string" ? item.status : null }
    : null;
}
