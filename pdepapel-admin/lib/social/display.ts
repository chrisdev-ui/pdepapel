import type { SocialPlatform } from "@prisma/client";

import type { SocialPostSummary } from "./report";

/** Cómo se muestran las métricas de una publicación en «Métricas de redes». Puro: sin red ni base. */
const NUMBER = new Intl.NumberFormat("es-CO");
const num = (value: number | null) =>
  value == null ? "—" : NUMBER.format(value);
const decimal = (value: number) =>
  String(Math.round(value * 10) / 10).replace(".", ",");
export const formatPct = (value: number | null) =>
  value == null ? "—" : `${decimal(value)} %`;
const seconds = (value: number | null) =>
  value == null ? "—" : `${decimal(value)} s`;

export type PlatformFilter = "ALL" | SocialPlatform;

/** Columnas de la tabla; con una sola red se ocultan las que esa red no tiene (TikTok no da alcance, guardados, tiempo visto ni salto). */
const COLUMNS: {
  key: string;
  label: string;
  instagramOnly?: boolean;
  cell: (post: SocialPostSummary) => string;
}[] = [
  { key: "views", label: "Vistas", cell: (post) => num(post.views) },
  { key: "views24h", label: "A las 24 h", cell: (post) => num(post.views24h) },
  {
    key: "multiplier",
    label: "× mediana",
    cell: (post) => (post.multiplier == null ? "—" : `${post.multiplier}×`),
  },
  {
    key: "reach",
    label: "Alcance",
    instagramOnly: true,
    cell: (post) => num(post.reach),
  },
  {
    key: "engagement",
    label: "Interacción",
    cell: (post) =>
      post.engagementRate == null ? "—" : `${post.engagementRate} %`,
  },
  {
    key: "saves",
    label: "Guardados",
    instagramOnly: true,
    cell: (post) => num(post.saves),
  },
  { key: "shares", label: "Compartidos", cell: (post) => num(post.shares) },
  {
    key: "avgWatch",
    label: "Tiempo promedio (s)",
    instagramOnly: true,
    cell: (post) =>
      post.avgWatchTimeMs == null ? "—" : seconds(post.avgWatchTimeMs / 1000),
  },
  {
    key: "watched",
    label: "% visto",
    instagramOnly: true,
    cell: (post) => formatPct(post.watchedPct),
  },
  {
    key: "skip",
    label: "Salto 3 s",
    instagramOnly: true,
    cell: (post) => formatPct(post.skipRate),
  },
  {
    key: "duration",
    label: "Duración",
    cell: (post) => seconds(post.durationSec),
  },
];

export const visibleColumns = (filter: PlatformFilter) =>
  COLUMNS.filter((column) => !(filter === "TIKTOK" && column.instagramOnly));

/** Todas las métricas guardadas de la última lectura; las que la red no da salen con «—». */
export function postMetricRows(post: SocialPostSummary): [string, string][] {
  return [
    ["Vistas", num(post.views)],
    ["Alcance", num(post.reach)],
    ["Me gusta", num(post.likes)],
    ["Comentarios", num(post.comments)],
    ["Compartidos", num(post.shares)],
    ["Guardados", num(post.saves)],
    ["Interacciones", num(post.totalInteractions)],
    ["Interacción", formatPct(post.engagementRate)],
    [
      "Tiempo promedio",
      post.avgWatchTimeMs == null ? "—" : seconds(post.avgWatchTimeMs / 1000),
    ],
    [
      "Tiempo total visto",
      post.totalWatchSeconds == null
        ? "—"
        : post.totalWatchSeconds >= 3600
          ? `${decimal(post.totalWatchSeconds / 3600)} h`
          : `${NUMBER.format(Math.round(post.totalWatchSeconds / 60))} min`,
    ],
    ["% visto", formatPct(post.watchedPct)],
    ["Salto en 3 s", formatPct(post.skipRate)],
    ["Duración", seconds(post.durationSec)],
  ];
}

const NETWORK_LABEL = { INSTAGRAM: "Instagram", TIKTOK: "TikTok" } as const;

/** Por qué lleva la alerta, en palabras: una línea por motivo (va en el tooltip, el celular y el detalle). */
export function retentionDetails(
  post: Pick<
    SocialPostSummary,
    "platform" | "retentionReasons" | "watchedPct" | "skipRate" | "skipMedian"
  >,
): string[] {
  const lines: string[] = [];
  if (post.retentionReasons.includes("watched") && post.watchedPct !== null)
    lines.push(`Se ve en promedio el ${formatPct(post.watchedPct)} del video.`);
  if (
    post.retentionReasons.includes("skip") &&
    post.skipRate !== null &&
    post.skipMedian !== null
  ) {
    lines.push(
      `El ${formatPct(post.skipRate)} lo salta en los primeros 3 s: ${decimal(post.skipRate - post.skipMedian)} puntos más que lo normal en ${NETWORK_LABEL[post.platform]} (${formatPct(post.skipMedian)}).`,
    );
  }
  return lines;
}
