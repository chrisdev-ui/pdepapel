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

/**
 * «× mediana» a la misma edad (decisión de Christian, 2026-10-22). Una
 * publicación de 7 días o más usa su lectura de 7 días; si no la tiene (ya era
 * vieja cuando se vio por primera vez), la última, marcada «aprox.». Una más
 * joven usa su última lectura y se compara con las otras publicaciones de la
 * red a esa misma edad. Con menos de 5 para comparar: «pocos datos».
 */
export const MULTIPLIER_MATURE_HOURS = 168;
export const MULTIPLIER_MIN_SAMPLE = 5;

export interface AgedPost {
  id: string;
  postedAt: Date;
  snapshots: CurveSnapshot[];
}

interface Reading {
  views: number;
  hours: number;
  approx: boolean;
  mature: boolean;
}

function readingOf(post: AgedPost, now: Date): Reading | null {
  const latest = post.snapshots.filter((snapshot) => snapshot.views !== null).at(-1);
  if (!latest || latest.views === null) return null;
  if (hoursSince(post.postedAt, now) < MULTIPLIER_MATURE_HOURS) return { views: latest.views, hours: latest.hoursSincePost, approx: false, mature: false };
  const atSevenDays = viewsAt(post.snapshots, MULTIPLIER_MATURE_HOURS);
  return atSevenDays === null
    ? { views: latest.views, hours: latest.hoursSincePost, approx: true, mature: true }
    : { views: atSevenDays, hours: MULTIPLIER_MATURE_HOURS, approx: false, mature: true };
}

export interface SameAgeMultiplier {
  multiplier: number | null;
  /** La lectura de la publicación o la de alguna comparada no es la de 7 días. */
  approx: boolean;
  /** Con cuántas publicaciones se comparó. */
  sample: number;
}

/** `posts` son las de una red en los últimos 90 días (el periodo elegido no cambia la base). */
export function sameAgeMultipliers(posts: readonly AgedPost[], now: Date): Map<string, SameAgeMultiplier> {
  const readings = new Map(posts.map((post) => [post.id, readingOf(post, now)]));
  const result = new Map<string, SameAgeMultiplier>();
  for (const post of posts) {
    const own = readings.get(post.id);
    if (!own) {
      result.set(post.id, { multiplier: null, approx: false, sample: 0 });
      continue;
    }
    const others = posts.filter((other) => other.id !== post.id);
    const peers = own.mature
      ? others.map((other) => readings.get(other.id)).filter((reading): reading is Reading => reading?.mature === true)
      : others.map((other) => viewsAt(other.snapshots, own.hours)).filter((views): views is number => views !== null).map((views) => ({ views, hours: own.hours, approx: false, mature: false }));
    const enough = peers.length >= MULTIPLIER_MIN_SAMPLE;
    result.set(post.id, {
      multiplier: enough ? outlierMultiplier(own.views, median(peers.map((peer) => peer.views))) : null,
      approx: enough && (own.approx || peers.some((peer) => peer.approx)),
      sample: peers.length,
    });
  }
  return result;
}

/** Menos de esto del video visto en promedio: «la mayoría deja de verlo muy pronto». */
export const RETENTION_MIN_WATCHED_PCT = 15;
/**
 * El salto en 3 s es relativo (decisión de Christian, 2026-10-22): con un
 * promedio de 62 % en la cuenta, un umbral fijo de 50 % marcaba casi todos los
 * reels. Se marca un reel que salta 10 puntos o más por encima de la mediana de
 * su red en 90 días, y solo con al menos 5 reels con ese dato.
 */
export const RETENTION_SKIP_POINTS_ABOVE_MEDIAN = 10;
export const RETENTION_MIN_SKIP_SAMPLE = 5;

/** Duración en segundos, o null si no se sabe: 0 o menos cuenta como desconocida (las fotos de TikTok llegan con 0). */
export function knownDuration(durationSec: number | null | undefined): number | null {
  return typeof durationSec === "number" && durationSec > 0 ? durationSec : null;
}

/** La duración leída del video gana; si no hay, la que escribió la dueña. */
export function effectiveDuration(readSec: number | null | undefined, manualSec: number | null | undefined): number | null {
  return knownDuration(readSec) ?? knownDuration(manualSec);
}

/**
 * Las vistas de la API son solo orgánicas. Una publicación PROMOTED sale de las medianas y de todo lo que compara;
 * la sugerencia «¿Promocionado?» no saca nada hasta que la dueña la confirma.
 */
export const isPromoted = (post: { promotion: string | null }) => post.promotion === "PROMOTED";

export const PROMOTION_SUGGEST_RATIO = 2;
export const PROMOTION_SUGGEST_MIN_TOTAL = 500;

/** «¿Promocionado?»: sin decisión todavía, y las vistas totales pasan de 2× las orgánicas y de 500. */
export function promotionSuggested(post: { promotion: string | null; totalViews: number | null; views: number | null }): boolean {
  if (post.promotion !== null || post.totalViews === null || post.views === null) return false;
  return post.totalViews > PROMOTION_SUGGEST_RATIO * post.views && post.totalViews > PROMOTION_SUGGEST_MIN_TOTAL;
}

/** Porcentaje del video que se ve en promedio; null sin duración o sin tiempo promedio. */
export function watchedPct(avgWatchTimeMs: number | null, durationSec: number | null) {
  const duration = knownDuration(durationSec);
  if (avgWatchTimeMs === null || duration === null) return null;
  return Math.round((avgWatchTimeMs / 1000 / duration) * 1000) / 10;
}

export interface SkipBaseline {
  /** Mediana del salto en 3 s de la red en 90 días; null con menos de 5 reels. */
  median: number | null;
  count: number;
}

export function skipBaseline(skipRates: readonly (number | null)[]): SkipBaseline {
  const values = skipRates.filter((value): value is number => value !== null && Number.isFinite(value));
  return { median: values.length >= RETENTION_MIN_SKIP_SAMPLE ? median(values) : null, count: values.length };
}

export type RetentionReason = "watched" | "skip";

/** Por qué un reel lleva la alerta: se ve poco, o lo saltan bastante más que lo normal en su red. */
export function retentionReasons(input: { watchedPct: number | null; skipRate: number | null; baseline: SkipBaseline | null }): RetentionReason[] {
  const reasons: RetentionReason[] = [];
  if (input.watchedPct !== null && input.watchedPct < RETENTION_MIN_WATCHED_PCT) reasons.push("watched");
  const skipMedian = input.baseline?.median ?? null;
  if (input.skipRate !== null && skipMedian !== null && input.skipRate >= skipMedian + RETENTION_SKIP_POINTS_ABOVE_MEDIAN) reasons.push("skip");
  return reasons;
}

/** Interacciones sobre alcance (Instagram) o sobre vistas (TikTok, que no da alcance). */
export function engagementRate(snapshot: { reach: number | null; views: number | null; totalInteractions: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }) {
  const interactions = snapshot.totalInteractions ?? [snapshot.likes, snapshot.comments, snapshot.shares, snapshot.saves].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const base = snapshot.reach ?? snapshot.views;
  if (!base) return null;
  return Math.round((interactions / base) * 1000) / 10;
}
