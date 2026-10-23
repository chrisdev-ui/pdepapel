import type { PrismaClient, SocialPlatform } from "@prisma/client";

import { dailyFollowers, type DailyFollowers } from "./followers";
import { CURVE_POINTS_HOURS, engagementRate, median, retentionReasons, sameAgeMultipliers, skipBaseline, viewsAt, watchedPct, type RetentionReason, type SameAgeMultiplier, type SkipBaseline } from "./metrics";
import { autoTags, tagOptions, type PostTags } from "./tags";
import { whatWorks, type WhatWorksNetwork } from "./what-works";

/**
 * Lo que muestran «Métricas de redes» y `social:report`, leído solo de la
 * base (nunca de Meta ni de TikTok). Sin tokens, `tokenRef` ni `raw`.
 */
type Db = Pick<PrismaClient, "socialAccount" | "socialPost" | "socialAccountSnapshot" | "socialMetricSnapshot" | "socialTag">;

const DAY = 86_400_000;
export const SOCIAL_REPORT_MAX_DAYS = 90;

export interface SocialAccountSummary {
  id: string;
  platform: SocialPlatform;
  username: string | null;
  status: "OK" | "NEEDS_RECONNECT" | "DISABLED";
  statusReason: string | null;
  lastSyncAt: string | null;
  followers: number | null;
  followersDelta: number | null;
  /** Seguidores por día de Bogotá (últimos 30), con el cambio a 7 y 30 días. */
  followersDaily: DailyFollowers;
}

export interface SocialPostSummary {
  id: string;
  platform: SocialPlatform;
  productType: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  totalInteractions: number | null;
  avgWatchTimeMs: number | null;
  /** Tiempo total visto, en segundos. */
  totalWatchSeconds: number | null;
  /** Salto en los primeros 3 s, en % (solo reels de Instagram). */
  skipRate: number | null;
  durationSec: number | null;
  /** Tiempo promedio ÷ duración, en %. */
  watchedPct: number | null;
  /** «La mayoría deja de verlo muy pronto»: menos del 15 % visto, o 10 puntos de salto por encima de lo normal en su red. */
  retentionWarning: boolean;
  retentionReasons: RetentionReason[];
  /** Mediana del salto en 3 s de su red en 90 días (para decir «lo normal»); null con menos de 5 reels. */
  skipMedian: number | null;
  engagementRate: number | null;
  views3h: number | null;
  views24h: number | null;
  views7d: number | null;
  /** «× mediana» a la misma edad; null con menos de 5 publicaciones para comparar («pocos datos»). */
  multiplier: number | null;
  multiplierApprox: boolean;
  multiplierSample: number;
  tags: PostTags;
}

export interface SocialSummary {
  days: number;
  accounts: SocialAccountSummary[];
  posts: SocialPostSummary[];
  medianViews: Partial<Record<SocialPlatform, number | null>>;
  /** Salto en 3 s de cada red en los últimos 90 días, sin importar el periodo elegido. */
  skipBaselines: Partial<Record<SocialPlatform, SkipBaseline>>;
  /** «Qué funciona» por red, con las publicaciones de los últimos 90 días. */
  whatWorks: WhatWorksNetwork[];
  /** Valores para el editor de etiquetas: los de fábrica y los que agregó la tienda. */
  tagOptions: PostTags;
}

export async function buildSocialSummary(db: Db, input: { storeId: string; days?: number; now?: Date }): Promise<SocialSummary> {
  const days = Math.min(Math.max(1, Math.round(input.days ?? 30)), SOCIAL_REPORT_MAX_DAYS);
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - days * DAY);

  const accounts = await db.socialAccount.findMany({
    where: { storeId: input.storeId },
    orderBy: { platform: "asc" },
    select: { id: true, platform: true, username: true, status: true, statusReason: true, lastSyncAt: true },
  });

  const accountSummaries: SocialAccountSummary[] = [];
  for (const account of accounts) {
    const [latest, first, recent] = await Promise.all([
      db.socialAccountSnapshot.findFirst({ where: { socialAccountId: account.id }, orderBy: { capturedAt: "desc" }, select: { followers: true } }),
      db.socialAccountSnapshot.findFirst({ where: { socialAccountId: account.id, capturedAt: { gte: since } }, orderBy: { capturedAt: "asc" }, select: { followers: true } }),
      // 32 días: el cambio a 30 días necesita una lectura de ese día o de antes.
      db.socialAccountSnapshot.findMany({
        where: { socialAccountId: account.id, capturedAt: { gte: new Date(now.getTime() - 32 * DAY) } },
        orderBy: { capturedAt: "asc" },
        select: { capturedAt: true, followers: true },
      }),
    ]);
    accountSummaries.push({
      ...account,
      lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
      followers: latest?.followers ?? null,
      followersDelta: latest?.followers != null && first?.followers != null ? latest.followers - first.followers : null,
      followersDaily: dailyFollowers(recent, now),
    });
  }

  // Una sola lectura de 90 días: la lista del periodo, la mediana del salto, el «× mediana» y «Qué funciona» salen de aquí.
  const [base, storedTags] = await Promise.all([
    db.socialPost.findMany({
      where: { socialAccountId: { in: accounts.map((account) => account.id) }, postedAt: { gte: new Date(now.getTime() - SOCIAL_REPORT_MAX_DAYS * DAY) } },
      orderBy: { postedAt: "desc" },
      take: 600,
      select: {
        id: true,
        platform: true,
        productType: true,
        caption: true,
        permalink: true,
        thumbnailUrl: true,
        postedAt: true,
        durationSec: true,
        snapshots: {
          orderBy: { capturedAt: "asc" },
          select: { hoursSincePost: true, views: true, reach: true, likes: true, comments: true, shares: true, saves: true, totalInteractions: true, avgWatchTimeMs: true, totalWatchTimeMs: true, skipRate: true },
        },
        tags: { select: { tag: { select: { kind: true, label: true } } } },
      },
    }),
    db.socialTag.findMany({ where: { storeId: input.storeId }, select: { kind: true, label: true } }),
  ]);
  const posts = base.filter((post) => post.postedAt >= since).slice(0, 300);

  const skipBaselines: SocialSummary["skipBaselines"] = {};
  const multipliers = new Map<string, SameAgeMultiplier>();
  for (const platform of Array.from(new Set(base.map((post) => post.platform)))) {
    const network = base.filter((post) => post.platform === platform);
    skipBaselines[platform] = skipBaseline(network.filter((post) => post.productType === "REELS").map((post) => post.snapshots.at(-1)?.skipRate ?? null));
    sameAgeMultipliers(network, now).forEach((value, id) => multipliers.set(id, value));
  }

  const medianViews: SocialSummary["medianViews"] = {};
  for (const platform of Array.from(new Set(posts.map((post) => post.platform)))) {
    medianViews[platform as SocialPlatform] = median(posts.filter((post) => post.platform === platform).map((post) => post.snapshots.at(-1)?.views ?? NaN));
  }

  const summarize = (post: (typeof base)[number]): SocialPostSummary => {
    const last = post.snapshots.at(-1);
    const views = last?.views ?? null;
    const [h3, h24, d7] = CURVE_POINTS_HOURS.map((hours) => viewsAt(post.snapshots, hours));
    const avgWatchTimeMs = last?.avgWatchTimeMs ?? null;
    const skipRate = last?.skipRate ?? null;
    const watched = watchedPct(avgWatchTimeMs, post.durationSec);
    const baseline = skipBaselines[post.platform] ?? null;
    const reasons = retentionReasons({ watchedPct: watched, skipRate, baseline });
    const multiplier = multipliers.get(post.id);
    return {
      id: post.id,
      platform: post.platform,
      productType: post.productType,
      caption: post.caption ? post.caption.slice(0, 140) : null,
      permalink: post.permalink,
      thumbnailUrl: post.thumbnailUrl,
      postedAt: post.postedAt.toISOString(),
      views,
      reach: last?.reach ?? null,
      likes: last?.likes ?? null,
      comments: last?.comments ?? null,
      shares: last?.shares ?? null,
      saves: last?.saves ?? null,
      totalInteractions: last?.totalInteractions ?? null,
      avgWatchTimeMs,
      totalWatchSeconds: last?.totalWatchTimeMs != null ? Math.round(Number(last.totalWatchTimeMs) / 1000) : null,
      skipRate: skipRate === null ? null : Math.round(skipRate * 10) / 10,
      durationSec: post.durationSec,
      watchedPct: watched,
      retentionWarning: reasons.length > 0,
      retentionReasons: reasons,
      skipMedian: baseline?.median ?? null,
      engagementRate: last ? engagementRate(last) : null,
      views3h: h3,
      views24h: h24,
      views7d: d7,
      multiplier: multiplier?.multiplier ?? null,
      multiplierApprox: multiplier?.approx ?? false,
      multiplierSample: multiplier?.sample ?? 0,
      tags: {
        FORMATO: post.tags.filter((item) => item.tag.kind === "FORMATO").map((item) => item.tag.label).sort((a, b) => a.localeCompare(b, "es")),
        GANCHO: post.tags.filter((item) => item.tag.kind === "GANCHO").map((item) => item.tag.label).sort((a, b) => a.localeCompare(b, "es")),
      },
    };
  };
  const summaries = new Map(base.map((post) => [post.id, summarize(post)]));
  const postSummaries = posts.map((post) => summaries.get(post.id)!);

  const works = whatWorks(
    base.map((post) => {
      const summary = summaries.get(post.id)!;
      return {
        platform: post.platform,
        multiplier: summary.multiplier,
        multiplierApprox: summary.multiplierApprox,
        watchedPct: summary.watchedPct,
        skipRate: summary.skipRate,
        tags: summary.tags,
        autoTags: autoTags(post),
      };
    }),
  );

  return { days, accounts: accountSummaries, posts: postSummaries, medianViews, skipBaselines, whatWorks: works, tagOptions: tagOptions(storedTags) };
}

/** La curva de una publicación de la tienda (null si no es suya). */
export async function getSocialPostCurve(db: Db, storeId: string, postId: string) {
  const post = await db.socialPost.findFirst({
    where: { id: postId, account: { storeId } },
    select: {
      id: true,
      snapshots: { orderBy: { capturedAt: "asc" }, take: 500, select: { capturedAt: true, hoursSincePost: true, views: true, likes: true, comments: true, shares: true, saves: true } },
    },
  });
  if (!post) return null;
  return post.snapshots.map((snapshot) => ({ ...snapshot, capturedAt: snapshot.capturedAt.toISOString() }));
}
