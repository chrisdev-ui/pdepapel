import type { SocialProductType } from "@prisma/client";

/**
 * Reglas puras de las métricas de redes: qué números se guardan, cuándo se
 * vuelve a preguntar por una publicación y cómo se lee la curva. Sin red ni base.
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Ventana en la que cada corrida pide métricas (las curvas de 3 h, 24 h y 7 d viven aquí). */
export const FRESH_WINDOW_DAYS = 30;
/** Más allá, una vez al día hasta un año; después, nunca. */
export const DAILY_WINDOW_DAYS = 365;

export const CURVE_POINTS_HOURS = [3, 24, 168] as const;

/**
 * Lista blanca de métricas de una publicación: nombre del proveedor → columna.
 * `raw` guarda solo estos nombres con su número; cualquier otra cosa que
 * devuelva la API (nombres de quienes comentan, textos) se descarta.
 */
export const INSTAGRAM_POST_METRICS = {
  views: "views",
  reach: "reach",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saved: "saves",
  total_interactions: "totalInteractions",
  ig_reels_avg_watch_time: "avgWatchTimeMs",
  ig_reels_video_view_total_time: "totalWatchTimeMs",
  reels_skip_rate: "skipRate",
} as const;

/**
 * Qué pedir según el tipo: una métrica que no aplica al tipo hace fallar toda
 * la consulta. `profile_views`, `plays` e `impressions` ya no existen.
 */
export const INSTAGRAM_METRICS_BY_TYPE = {
  REELS: ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reels_skip_rate"],
  FEED: ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"],
} as const;

export const TIKTOK_POST_METRICS = {
  view_count: "views",
  like_count: "likes",
  comment_count: "comments",
  share_count: "shares",
} as const;

export type MetricColumn =
  | "views"
  | "reach"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "totalInteractions"
  | "avgWatchTimeMs"
  | "totalWatchTimeMs"
  | "skipRate";

export interface MetricValues {
  columns: Partial<Record<MetricColumn, number>>;
  raw: Record<string, number>;
}

/** Solo números finitos de nombres permitidos. */
export function pickMetrics(source: Record<string, unknown>, whitelist: Record<string, MetricColumn>): MetricValues {
  const columns: MetricValues["columns"] = {};
  const raw: Record<string, number> = {};
  for (const [name, column] of Object.entries(whitelist)) {
    const value = source[name];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    raw[name] = value;
    columns[column] = column === "skipRate" ? value : Math.round(value);
  }
  return { columns, raw };
}

/** Lista blanca de la cuenta: seguidores y totales, nada más. */
export const ACCOUNT_METRICS = {
  followers_count: "followers",
  follower_count: "followers",
  follows_count: "following",
  following_count: "following",
  media_count: "mediaCount",
  video_count: "mediaCount",
  likes_count: "likesTotal",
} as const;

export type AccountColumn = (typeof ACCOUNT_METRICS)[keyof typeof ACCOUNT_METRICS];

export function pickAccountMetrics(source: Record<string, unknown>) {
  const columns: Partial<Record<AccountColumn, number>> = {};
  const raw: Record<string, number> = {};
  for (const [name, column] of Object.entries(ACCOUNT_METRICS)) {
    const value = source[name];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    raw[name] = value;
    columns[column] = Math.round(value);
  }
  return { columns, raw };
}

export function hoursSince(postedAt: Date, now: Date) {
  return Math.max(0, (now.getTime() - postedAt.getTime()) / HOUR);
}

/**
 * ¿Toca pedir métricas de esta publicación ahora? Las de los últimos 30 días en
 * cada corrida; las de hasta un año, si la última vez fue hace un día o más.
 */
export function shouldPollPost(post: { postedAt: Date; metricsSyncedAt: Date | null }, now: Date) {
  const age = now.getTime() - post.postedAt.getTime();
  if (age <= FRESH_WINDOW_DAYS * DAY) return true;
  if (age > DAILY_WINDOW_DAYS * DAY) return false;
  return !post.metricsSyncedAt || now.getTime() - post.metricsSyncedAt.getTime() >= DAY - HOUR;
}

export function instagramProductType(mediaType: string | null | undefined, productType: string | null | undefined): SocialProductType | null {
  if (productType === "REELS") return "REELS";
  if (productType === "STORY") return "STORY";
  if (mediaType === "CAROUSEL_ALBUM") return "CAROUSEL";
  if (productType === "FEED" || mediaType === "IMAGE" || mediaType === "VIDEO") return "FEED";
  return null;
}

/** Videos y reels traen `thumbnail_url`; imágenes y carruseles, solo `media_url`. */
export function instagramThumbnail(media: { media_type?: string; thumbnail_url?: string; media_url?: string }) {
  if (media.thumbnail_url) return media.thumbnail_url;
  return media.media_type === "VIDEO" ? null : (media.media_url ?? null);
}

export interface CurveSnapshot {
  hoursSincePost: number;
  views: number | null;
}

/**
 * Vistas cerca de una hora dada: la foto más cercana entre la mitad y 1,5 veces
 * ese punto. Sin foto en ese rango (la publicación es anterior al primer sync, o
 * el cron se atrasó), null en vez de un número engañoso.
 */
export function viewsAt(snapshots: CurveSnapshot[], targetHours: number) {
  let best: CurveSnapshot | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.views === null) continue;
    if (snapshot.hoursSincePost < targetHours * 0.5 || snapshot.hoursSincePost > targetHours * 1.5) continue;
    if (!best || Math.abs(snapshot.hoursSincePost - targetHours) < Math.abs(best.hoursSincePost - targetHours)) best = snapshot;
  }
  return best?.views ?? null;
}

export function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Cuántas veces la mediana de la cuenta; null sin base para comparar. */
export function outlierMultiplier(value: number | null, baseline: number | null) {
  if (value === null || baseline === null || baseline <= 0) return null;
  return Math.round((value / baseline) * 10) / 10;
}

/** Por debajo de esto del video visto en promedio, o por encima de este salto en 3 s, «la mayoría deja de verlo muy pronto». */
export const RETENTION_MIN_WATCHED_PCT = 15;
export const RETENTION_MAX_SKIP_PCT = 50;

/** Porcentaje del video que se ve en promedio; null sin duración o sin tiempo promedio. */
export function watchedPct(avgWatchTimeMs: number | null, durationSec: number | null) {
  if (avgWatchTimeMs === null || durationSec === null || !(durationSec > 0)) return null;
  return Math.round((avgWatchTimeMs / 1000 / durationSec) * 1000) / 10;
}

/** Alerta de retención: se ve menos del 15 % en promedio, o más de la mitad lo salta en los primeros 3 s. */
export function retentionWarning(input: { watchedPct: number | null; skipRate: number | null }) {
  return (input.watchedPct !== null && input.watchedPct < RETENTION_MIN_WATCHED_PCT) || (input.skipRate !== null && input.skipRate > RETENTION_MAX_SKIP_PCT);
}

/** Interacciones sobre alcance (Instagram) o sobre vistas (TikTok, que no da alcance). */
export function engagementRate(snapshot: { reach: number | null; views: number | null; totalInteractions: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }) {
  const interactions = snapshot.totalInteractions ?? [snapshot.likes, snapshot.comments, snapshot.shares, snapshot.saves].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const base = snapshot.reach ?? snapshot.views;
  if (!base) return null;
  return Math.round((interactions / base) * 1000) / 10;
}
