import { addDays, format, parseISO } from "date-fns";

import { colombiaDay } from "@/lib/order-list-filters";

/**
 * Seguidores por día de Bogotá: la última lectura de cada día (la cuenta se lee
 * cada 6 h), el cambio frente al día anterior con lectura y el cambio a 7 y 30
 * días. Sin una lectura de ese día o de antes, el cambio es null («pocos datos»):
 * nunca se inventa una base.
 */
export const FOLLOWER_SERIES_DAYS = 30;

export interface FollowerDay {
  day: string;
  followers: number;
  /** Frente al día anterior con lectura; null en el primero. */
  change: number | null;
}

export interface DailyFollowers {
  series: FollowerDay[];
  delta7: number | null;
  delta30: number | null;
  /** Primer día con lectura (yyyy-MM-dd), para decir desde cuándo hay datos. */
  since: string | null;
}

const shiftDay = (day: string, days: number) =>
  format(addDays(parseISO(day), days), "yyyy-MM-dd");

export function dailyFollowers(
  snapshots: readonly { capturedAt: Date; followers: number | null }[],
  now: Date,
): DailyFollowers {
  const lastOfDay = new Map<string, { at: number; followers: number }>();
  for (const snapshot of snapshots) {
    if (snapshot.followers === null) continue;
    const day = colombiaDay(snapshot.capturedAt);
    const current = lastOfDay.get(day);
    if (!current || snapshot.capturedAt.getTime() >= current.at)
      lastOfDay.set(day, {
        at: snapshot.capturedAt.getTime(),
        followers: snapshot.followers,
      });
  }
  const today = colombiaDay(now);
  const days = Array.from(lastOfDay.entries())
    .filter(([day]) => day <= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ day, followers: value.followers }));
  const latest = days.at(-1) ?? null;
  const deltaOver = (window: number) => {
    if (!latest) return null;
    const cutoff = shiftDay(today, -window);
    const base = [...days].reverse().find((entry) => entry.day <= cutoff);
    return base ? latest.followers - base.followers : null;
  };
  const firstShown = shiftDay(today, -(FOLLOWER_SERIES_DAYS - 1));
  const series: FollowerDay[] = [];
  days.forEach((entry, index) => {
    if (entry.day < firstShown) return;
    series.push({
      day: entry.day,
      followers: entry.followers,
      change: index > 0 ? entry.followers - days[index - 1].followers : null,
    });
  });
  return {
    series,
    delta7: deltaOver(7),
    delta30: deltaOver(30),
    since: days[0]?.day ?? null,
  };
}
