import { SocialPlatform, type SocialProductType } from "@prisma/client";

import { GRAPH_API_VERSION } from "./config";
import { SocialApiError } from "./errors";
import { INSTAGRAM_METRICS_BY_TYPE, INSTAGRAM_POST_METRICS, instagramProductType, instagramThumbnail, pickMetrics, type MetricValues } from "./metrics";
import type { SocialAdapter } from "./sync";

/**
 * Cliente de solo lectura de Instagram (Graph API con el token de la página).
 * El token va en `access_token`, el único medio documentado en
 * graph.facebook.com; por eso la URL nunca se registra ni entra a un error.
 * Tras cada respuesta lee X-App-Usage y X-Business-Use-Case-Usage: desde el
 * 80 % no hace más llamadas en esta corrida y pide esperar.
 */
const BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const TIMEOUT_MS = 15_000;
const USAGE_PAUSE_PERCENT = 80;
const THROTTLE_CODES = new Set([4, 17, 32, 613, 80002]);
const AUTH_CODES = new Set([102, 190]);
const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp";

type FetchImpl = typeof fetch;

interface UsageEntry {
  call_count?: number;
  total_time?: number;
  total_cputime?: number;
  estimated_time_to_regain_access?: number;
}

/** Segundos a esperar según los encabezados de uso, o null si hay margen. */
export function usagePauseSeconds(headers: Headers): number | null {
  const entries: UsageEntry[] = [];
  const parse = (name: string) => {
    const value = headers.get(name);
    if (!value) return;
    try {
      const parsed = JSON.parse(value) as UsageEntry | Record<string, UsageEntry[]>;
      if ("call_count" in parsed || "total_time" in parsed) entries.push(parsed as UsageEntry);
      else for (const list of Object.values(parsed)) if (Array.isArray(list)) entries.push(...list);
    } catch {}
  };
  parse("x-app-usage");
  parse("x-business-use-case-usage");
  let worst = 0;
  let regainMinutes = 0;
  for (const entry of entries) {
    worst = Math.max(worst, entry.call_count ?? 0, entry.total_time ?? 0, entry.total_cputime ?? 0);
    regainMinutes = Math.max(regainMinutes, entry.estimated_time_to_regain_access ?? 0);
  }
  if (worst < USAGE_PAUSE_PERCENT && regainMinutes === 0) return null;
  return Math.max(300, regainMinutes * 60);
}

export class GraphClient {
  private pausedForSeconds: number | null = null;

  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchImpl = fetch,
  ) {}

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    if (this.pausedForSeconds !== null) {
      throw new SocialApiError(SocialPlatform.INSTAGRAM, "rate_limit", "meta_usage", null, this.pausedForSeconds);
    }
    const url = new URL(`${BASE}${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    url.searchParams.set("access_token", this.token);

    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch {
      throw new SocialApiError(SocialPlatform.INSTAGRAM, "http", "network", null);
    }
    this.pausedForSeconds = usagePauseSeconds(response.headers);

    const body = (await response.json().catch(() => null)) as { error?: { code?: number } } | null;
    if (!response.ok || body?.error) {
      const code = typeof body?.error?.code === "number" ? body.error.code : null;
      if (code !== null && AUTH_CODES.has(code)) throw new SocialApiError(SocialPlatform.INSTAGRAM, "auth", `meta_${code}`, response.status);
      if ((code !== null && THROTTLE_CODES.has(code)) || response.status === 429) {
        throw new SocialApiError(SocialPlatform.INSTAGRAM, "rate_limit", `meta_${code ?? 429}`, response.status, this.pausedForSeconds ?? 600);
      }
      if (code === 100) throw new SocialApiError(SocialPlatform.INSTAGRAM, "invalid_metric", "meta_100", response.status);
      throw new SocialApiError(SocialPlatform.INSTAGRAM, "http", code !== null ? `meta_${code}` : `http_${response.status}`, response.status);
    }
    return body as T;
  }
}

interface InsightRow {
  name: string;
  values?: { value?: unknown }[];
  total_value?: { value?: unknown };
}

const insightValue = (row: InsightRow) => row.total_value?.value ?? row.values?.[0]?.value;

/** Las métricas de un tipo; si la consulta completa falla por una métrica (código 100), una por una. */
export async function fetchInstagramMediaMetrics(client: GraphClient, mediaId: string, productType: SocialProductType | null): Promise<MetricValues> {
  if (productType === "STORY") return { columns: {}, raw: {} };
  const metrics: readonly string[] = productType === "REELS" ? INSTAGRAM_METRICS_BY_TYPE.REELS : INSTAGRAM_METRICS_BY_TYPE.FEED;
  const collect = (rows: InsightRow[]) => Object.fromEntries(rows.map((row) => [row.name, insightValue(row)]));
  try {
    const response = await client.get<{ data: InsightRow[] }>(`/${mediaId}/insights`, { metric: metrics.join(",") });
    return pickMetrics(collect(response.data ?? []), INSTAGRAM_POST_METRICS);
  } catch (error) {
    if (!(error instanceof SocialApiError && error.kind === "invalid_metric")) throw error;
  }
  const values: Record<string, unknown> = {};
  for (const metric of metrics) {
    try {
      const response = await client.get<{ data: InsightRow[] }>(`/${mediaId}/insights`, { metric });
      Object.assign(values, collect(response.data ?? []));
    } catch (error) {
      if (!(error instanceof SocialApiError && error.kind === "invalid_metric")) throw error;
    }
  }
  return pickMetrics(values, INSTAGRAM_POST_METRICS);
}

/** La cuenta profesional ligada a la página del token. */
export async function discoverInstagramAccount(client: GraphClient) {
  const page = await client.get<{ id: string; instagram_business_account?: { id: string } }>("/me", { fields: "id,instagram_business_account" });
  const igUserId = page.instagram_business_account?.id;
  if (!igUserId) throw new SocialApiError(SocialPlatform.INSTAGRAM, "auth", "meta_no_ig_account", null);
  const profile = await client.get<Record<string, unknown> & { id: string; username?: string }>(`/${igUserId}`, { fields: "id,username,followers_count,follows_count,media_count" });
  return { externalId: profile.id, username: profile.username ?? null, pageId: page.id, metrics: profile };
}

interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
}

export function createInstagramAdapter(options: { pageToken: string; igUserId: string; fetchImpl?: FetchImpl }): SocialAdapter {
  const client = new GraphClient(options.pageToken, options.fetchImpl);
  return {
    platform: SocialPlatform.INSTAGRAM,
    fetchAccount: () => discoverInstagramAccount(client),
    async listPosts(cursor) {
      const response = await client.get<{ data: MediaItem[]; paging?: { next?: string; cursors?: { after?: string } } }>(`/${options.igUserId}/media`, {
        fields: MEDIA_FIELDS,
        limit: "25",
        ...(cursor ? { after: cursor } : {}),
      });
      return {
        posts: (response.data ?? []).map((media) => ({
          externalId: media.id,
          mediaType: media.media_type ?? null,
          productType: instagramProductType(media.media_type, media.media_product_type),
          caption: media.caption ?? null,
          permalink: media.permalink ?? null,
          thumbnailUrl: instagramThumbnail(media),
          durationSec: null,
          postedAt: new Date(media.timestamp),
        })),
        next: response.paging?.next ? (response.paging.cursors?.after ?? null) : null,
      };
    },
    fetchPostMetrics: (externalId, post) => fetchInstagramMediaMetrics(client, externalId, post.productType),
  };
}
