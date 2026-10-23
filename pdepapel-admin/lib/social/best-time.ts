import type { SocialPlatform } from "@prisma/client";

import { median } from "./metrics";
import { HOUR_BANDS, WEEKDAYS, type AutoTag } from "./tags";

/**
 * Mejor horario: por red, día × franja de Bogotá con la mediana de «× mediana».
 * Una casilla con menos de 2 publicaciones queda vacía (sin color ni número).
 */
export const BEST_TIME_MIN_POSTS = 2;
/** Lunes primero, como se lee la semana en Colombia. */
export const BEST_TIME_DAYS = [...WEEKDAYS.slice(1), WEEKDAYS[0]] as const;
export const BEST_TIME_BANDS = HOUR_BANDS.map((band) => band.label);

export interface BestTimePost {
  platform: SocialPlatform;
  multiplier: number | null;
  multiplierApprox: boolean;
  autoTags: AutoTag[];
}

export interface BestTimeCell {
  day: string;
  band: string;
  count: number;
  /** null con menos de 2 publicaciones o sin «× mediana» en ninguna. */
  medianMultiplier: number | null;
  approx: boolean;
}

export interface BestTimeNetwork {
  platform: SocialPlatform;
  /** Una fila por día (lunes a domingo), una casilla por franja. */
  rows: BestTimeCell[][];
  filled: number;
  approx: boolean;
}

export function bestTimeGrid(posts: readonly BestTimePost[]): BestTimeNetwork[] {
  return Array.from(new Set(posts.map((post) => post.platform)))
    .sort()
    .map((platform) => {
      const own = posts.filter((post) => post.platform === platform);
      const rows = BEST_TIME_DAYS.map((day) =>
        BEST_TIME_BANDS.map((band) => {
          const inCell = own.filter((post) => post.autoTags.some((tag) => tag.group === "DIA" && tag.label === day) && post.autoTags.some((tag) => tag.group === "FRANJA" && tag.label === band));
          const measured = inCell.filter((post) => post.multiplier !== null);
          const value = inCell.length >= BEST_TIME_MIN_POSTS ? median(measured.map((post) => post.multiplier!)) : null;
          return {
            day,
            band,
            count: inCell.length,
            medianMultiplier: value === null ? null : Math.round(value * 10) / 10,
            approx: value !== null && measured.some((post) => post.multiplierApprox),
          };
        }),
      );
      const cells = rows.flat().filter((cell) => cell.medianMultiplier !== null);
      return { platform, rows, filled: cells.length, approx: cells.some((cell) => cell.approx) };
    });
}

/** Cuatro tonos fijos frente a la mediana de la red (1×), para que el color diga lo mismo cada semana. */
export function bestTimeLevel(value: number | null): 0 | 1 | 2 | 3 | 4 {
  if (value === null) return 0;
  if (value < 0.8) return 1;
  if (value < 1.2) return 2;
  if (value < 1.6) return 3;
  return 4;
}
