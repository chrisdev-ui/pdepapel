import type { SocialPlatform } from "@prisma/client";
import { addDays, format, parseISO } from "date-fns";

import { colombiaDay } from "@/lib/order-list-filters";

import { NETWORK_NAME } from "./tags";

/**
 * «Copiar resumen semanal»: texto para WhatsApp con los últimos 7 días de
 * Bogotá. Sin enlaces, sin tokens y sin datos de personas: de cada publicación
 * solo su texto recortado a 60 caracteres, sin direcciones, correos,
 * teléfonos ni @menciones.
 */
export const SUMMARY_CAPTION_MAX = 60;
const NETWORKS: SocialPlatform[] = ["INSTAGRAM", "TIKTOK"];
const DECIMAL = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const NUMBER = new Intl.NumberFormat("es-CO");
const MONTHS = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."];

export interface WeeklySummaryInput {
  accounts: { platform: SocialPlatform; followersDaily: { delta7: number | null } }[];
  posts: { platform: SocialPlatform; postedAt: string; caption: string | null; productType: string | null; multiplier: number | null; multiplierApprox: boolean; retentionWarning: boolean }[];
  whatWorks: { platform: SocialPlatform; headline: string | null; headlineTentative: boolean }[];
}

/** El texto de la publicación sin nada que identifique a alguien ni lleve a un enlace. */
export function summaryCaption(caption: string | null, productType: string | null) {
  const clean = (caption ?? "")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/\S+@\S+\.\S+/g, "")
    .replace(/@[\w.]+/g, "")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return productType === "CAROUSEL" ? "un carrusel" : productType === "FEED" ? "una foto" : "una publicación sin texto";
  return clean.length > SUMMARY_CAPTION_MAX ? `«${clean.slice(0, SUMMARY_CAPTION_MAX - 1).trimEnd()}…»` : `«${clean}»`;
}

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${NUMBER.format(Math.abs(value))}`;
const times = (post: { multiplier: number | null; multiplierApprox: boolean }) => `${DECIMAL.format(post.multiplier!)}× la mediana${post.multiplierApprox ? " (aprox.)" : ""}`;
const dayLabel = (day: string) => `${Number(day.slice(8))} de ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

export function weeklySummaryText(input: WeeklySummaryInput, now: Date): string {
  const today = colombiaDay(now);
  const first = format(addDays(parseISO(today), -6), "yyyy-MM-dd");
  const week = input.posts.filter((post) => {
    const day = colombiaDay(new Date(post.postedAt));
    return day >= first && day <= today;
  });

  const lines = [`📊 *Resumen de redes · ${dayLabel(first)} al ${dayLabel(today)}*`, ""];
  const connected = NETWORKS.filter((platform) => input.accounts.some((account) => account.platform === platform));
  let bestOverall: (typeof week)[number] | null = null;

  for (const platform of connected) {
    const own = week.filter((post) => post.platform === platform);
    const delta = input.accounts.find((account) => account.platform === platform)?.followersDaily.delta7 ?? null;
    lines.push(`*${NETWORK_NAME[platform]}* · ${own.length} ${own.length === 1 ? "publicación" : "publicaciones"} · seguidores ${delta === null ? "pocos datos" : delta === 0 ? "sin cambio" : signed(delta)}`);
    const ranked = own.filter((post) => post.multiplier !== null).sort((a, b) => b.multiplier! - a.multiplier!);
    if (own.length && !ranked.length) lines.push("Todavía sin «× mediana» para comparar (pocos datos).");
    if (ranked.length) {
      lines.push(`⭐ Mejor: ${summaryCaption(ranked[0].caption, ranked[0].productType)} · ${times(ranked[0])}`);
      if (!bestOverall || ranked[0].multiplier! > bestOverall.multiplier!) bestOverall = ranked[0];
    }
    if (ranked.length >= 2) {
      const worst = ranked[ranked.length - 1];
      lines.push(`🐢 Más floja: ${summaryCaption(worst.caption, worst.productType)} · ${times(worst)}`);
    }
    lines.push("");
  }

  const headlines = input.whatWorks.filter((network) => network.headline && connected.includes(network.platform));
  if (headlines.length) {
    lines.push("💡 *Qué funciona:*");
    for (const network of headlines) lines.push(`${network.headline}${network.headlineTentative ? " Todavía es una pista." : ""}`);
    lines.push("");
  }

  lines.push(`👉 *Para esta semana:* ${recommendation({ week, connected, bestOverall })}`);
  return lines.join("\n");
}

/** Una sola recomendación, la primera regla que se cumple, con texto fijo. */
function recommendation({ week, connected, bestOverall }: { week: WeeklySummaryInput["posts"]; connected: SocialPlatform[]; bestOverall: WeeklySummaryInput["posts"][number] | null }) {
  if (!week.length) return "Esta semana no hubo publicaciones: con una o dos ya vuelve a haber con qué comparar.";
  const silent = connected.find((platform) => !week.some((post) => post.platform === platform));
  const active = connected.find((platform) => week.some((post) => post.platform === platform));
  if (silent && active) return `Esta semana no se publicó en ${NETWORK_NAME[silent]}: súbele la mejor de ${NETWORK_NAME[active]}.`;
  if (bestOverall && bestOverall.multiplier! >= 2) return `La mejor fue ${DECIMAL.format(bestOverall.multiplier!)}× la mediana: haz otra parecida esta semana.`;
  const early = week.filter((post) => post.retentionWarning).length;
  if (early) return `${early === 1 ? "Una publicación se deja" : `${early} publicaciones se dejan`} de ver muy pronto: prueba un gancho más fuerte en el primer segundo.`;
  return "Etiqueta las publicaciones de la semana: así «Qué funciona» se llena más rápido.";
}
