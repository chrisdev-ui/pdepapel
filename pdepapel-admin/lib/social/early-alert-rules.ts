import type { SocialEarlyAlertKind, SocialPlatform } from "@prisma/client";

import { median } from "./metrics";
import { NETWORK_NAME } from "./tags";

/**
 * Alerta temprana: a las 2–6 h, las vistas de una publicación frente a la
 * mediana de su red a la misma edad (± 1 h). Solo con 10 o más publicaciones
 * con lectura a esa edad; antes no dice nada.
 */
export const EARLY_MIN_HOURS = 2;
export const EARLY_MAX_HOURS = 6;
export const EARLY_AGE_WINDOW_HOURS = 1;
export const EARLY_MIN_HISTORY = 10;
export const EARLY_UP = 1.5;
export const EARLY_DOWN = 0.5;
export const EARLY_DAILY_EMAILS = 3;

export interface EarlySnapshot {
  hoursSincePost: number;
  views: number | null;
}

/** La lectura más cercana a `hours` dentro de ± 1 h; null si no hay. */
export function viewsNear(snapshots: readonly EarlySnapshot[], hours: number): number | null {
  let best: EarlySnapshot | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.views === null || Math.abs(snapshot.hoursSincePost - hours) > EARLY_AGE_WINDOW_HOURS) continue;
    if (!best || Math.abs(snapshot.hoursSincePost - hours) < Math.abs(best.hoursSincePost - hours)) best = snapshot;
  }
  return best?.views ?? null;
}

export interface EarlyVerdict {
  kind: SocialEarlyAlertKind | null;
  ratio: number | null;
  hours: number;
  history: number;
}

/**
 * `latest` es la última lectura de la publicación (debe estar entre 2 y 6 h);
 * `others` son las demás publicaciones de la red (90 días) con sus lecturas.
 */
export function earlyVerdict(latest: EarlySnapshot, others: readonly (readonly EarlySnapshot[])[]): EarlyVerdict | null {
  if (latest.views === null || latest.hoursSincePost < EARLY_MIN_HOURS || latest.hoursSincePost > EARLY_MAX_HOURS) return null;
  const peers = others.map((snapshots) => viewsNear(snapshots, latest.hoursSincePost)).filter((views): views is number => views !== null);
  const base = { hours: latest.hoursSincePost, history: peers.length };
  if (peers.length < EARLY_MIN_HISTORY) return { ...base, kind: null, ratio: null };
  const typical = median(peers);
  if (!typical || typical <= 0) return { ...base, kind: null, ratio: null };
  // Se compara el cociente exacto y se redondea solo para mostrarlo: 1,49× no es «Va despegando».
  const exact = latest.views / typical;
  return { ...base, ratio: Math.round(exact * 10) / 10, kind: exact >= EARLY_UP ? "DESPEGANDO" : exact <= EARLY_DOWN ? "LENTA" : null };
}

/** Cuántas publicaciones de la red tienen lectura a las 2–6 h: la alerta necesita 10. */
export function earlyHistoryCount(posts: readonly (readonly EarlySnapshot[])[]): number {
  return posts.filter((snapshots) => snapshots.some((snapshot) => snapshot.views !== null && snapshot.hoursSincePost >= EARLY_MIN_HOURS && snapshot.hoursSincePost <= EARLY_MAX_HOURS)).length;
}

export interface EarlyAlertStatus {
  /** Interruptor de emergencia de la tienda (encendido por defecto). */
  switchOn: boolean;
  needed: number;
  /** Por red: publicaciones con lectura a las 2–6 h y si ya se encendió sola. */
  networks: Partial<Record<SocialPlatform, { history: number; on: boolean }>>;
}

export function earlyAlertStatus(switchOn: boolean, history: Partial<Record<SocialPlatform, number>>): EarlyAlertStatus {
  const networks: EarlyAlertStatus["networks"] = {};
  for (const [platform, count] of Object.entries(history) as [SocialPlatform, number][]) {
    networks[platform] = { history: count, on: switchOn && count >= EARLY_MIN_HISTORY };
  }
  return { switchOn, needed: EARLY_MIN_HISTORY, networks };
}

/** La línea de «Métricas de redes»: «Instagram: encendida · TikTok: apagada, 4 de 10», o pausada desde el panel. */
export function earlyAlertLine(status: EarlyAlertStatus) {
  if (!status.switchOn) return "Alerta temprana: pausada desde el panel. No avisa en ninguna red hasta reanudarla.";
  const parts = (Object.entries(status.networks) as [SocialPlatform, { history: number; on: boolean }][])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([platform, network]) => `${NETWORK_NAME[platform]}: ${network.on ? "encendida" : `apagada, ${Math.min(network.history, status.needed)} de ${status.needed}`}`);
  if (!parts.length) return "Alerta temprana: se enciende sola en cada red al juntar 10 publicaciones con lectura a las 2–6 h.";
  return `Alerta temprana — ${parts.join(" · ")}. Cada red se enciende sola al juntar ${status.needed} publicaciones con lectura a las 2–6 h.`;
}

const DECIMAL = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** Título, frase y acción, en palabras de Paula. */
export function earlyAlertCopy(alert: { kind: SocialEarlyAlertKind; ratio: number; hoursSincePost: number; platform: SocialPlatform }) {
  const network = NETWORK_NAME[alert.platform];
  const hours = Math.round(alert.hoursSincePost);
  return alert.kind === "DESPEGANDO"
    ? {
        title: `Va despegando en ${network}`,
        summary: `A las ${hours} h lleva ${DECIMAL.format(alert.ratio)}× lo normal para esa edad.`,
        action: "Respóndele a los comentarios ya y súbelo a historias.",
      }
    : {
        title: `Va lenta en ${network}`,
        summary: `A las ${hours} h lleva ${DECIMAL.format(alert.ratio)}× lo normal para esa edad.`,
        action: "Revisa la portada y el primer segundo; prueba otra hora para la próxima.",
      };
}
