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
  userProductId: string | null;
  familyId: string | null;
}

export interface SellerSkuItem extends AdoptedItem {
  title: string | null;
  dateCreated: string | null;
}

const optionalString = (value: unknown) => (typeof value === "string" && value ? value : null);
const optionalId = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : optionalString(value);

/** Los ítems del vendedor con ese SKU, con su producto de usuario y su familia. */
export async function findSellerItemsBySku(connectionId: string, sku: string): Promise<SellerSkuItem[]> {
  const connection = await prismadb.marketplaceConnection.findUnique({ where: { id: connectionId }, select: { sellerId: true } });
  if (!connection?.sellerId || !sku.trim()) return [];

  const ids = new Set<string>();
  for (const param of ["seller_sku", "sku"]) {
    const search = (await getMercadoLibreJson(
      connectionId,
      `/users/${encodeURIComponent(connection.sellerId)}/items/search?${param}=${encodeURIComponent(sku.trim())}`,
    )) as { results?: unknown };
    if (Array.isArray(search?.results)) for (const id of search.results) if (typeof id === "string") ids.add(id);
  }
  if (!ids.size) return [];

  const items = (await getMercadoLibreJson(
    connectionId,
    `/items?ids=${Array.from(ids).slice(0, 20).map(encodeURIComponent).join(",")}&attributes=id,permalink,status,title,date_created,user_product_id,family_id`,
  )) as unknown;
  return (Array.isArray(items) ? items : [])
    .map((entry) => asRecord(asRecord(entry).body))
    .filter((body) => typeof body.id === "string")
    .map((body) => ({
      id: String(body.id),
      permalink: optionalString(body.permalink),
      status: optionalString(body.status),
      title: optionalString(body.title),
      dateCreated: optionalString(body.date_created),
      userProductId: optionalString(body.user_product_id),
      familyId: optionalId(body.family_id),
    }));
}

/**
 * El ítem que creó un intento anterior: mismo SKU y creado después de que
 * empezó el intento. Un ítem viejo con el mismo SKU (otra publicación) no cuenta.
 */
export async function findItemFromAttempt(connectionId: string, attempt: PublishAttempt): Promise<AdoptedItem | null> {
  if (!attempt.sku) return null;
  const startedAt = new Date(attempt.startedAt).getTime() - CLOCK_SKEW_MS;
  const item = (await findSellerItemsBySku(connectionId, attempt.sku))
    .filter((candidate) => new Date(candidate.dateCreated ?? 0).getTime() >= startedAt)
    .sort((a, b) => new Date(a.dateCreated!).getTime() - new Date(b.dateCreated!).getTime())[0];
  return item
    ? { id: item.id, permalink: item.permalink, status: item.status, userProductId: item.userProductId, familyId: item.familyId }
    : null;
}
