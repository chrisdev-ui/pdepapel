import type { PrismaClient, SocialPlatform } from "@prisma/client";

import { CURVE_POINTS_HOURS, engagementRate, median, outlierMultiplier, viewsAt } from "./metrics";

/**
 * Lo que muestran «Métricas de redes» y `social:report`, leído solo de la
 * base (nunca de Meta ni de TikTok). Sin tokens, `tokenRef` ni `raw`.
 */
type Db = Pick<PrismaClient, "socialAccount" | "socialPost" | "socialAccountSnapshot" | "socialMetricSnapshot">;

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
  avgWatchTimeMs: number | null;
  engagementRate: number | null;
  views3h: number | null;
  views24h: number | null;
  views7d: number | null;
  multiplier: number | null;
}

export interface SocialSummary {
  days: number;
  accounts: SocialAccountSummary[];
  posts: SocialPostSummary[];
  medianViews: Partial<Record<SocialPlatform, number | null>>;
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
    const [latest, first] = await Promise.all([
      db.socialAccountSnapshot.findFirst({ where: { socialAccountId: account.id }, orderBy: { capturedAt: "desc" }, select: { followers: true } }),
      db.socialAccountSnapshot.findFirst({ where: { socialAccountId: account.id, capturedAt: { gte: since } }, orderBy: { capturedAt: "asc" }, select: { followers: true } }),
    ]);
    accountSummaries.push({
      ...account,
      lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
      followers: latest?.followers ?? null,
      followersDelta: latest?.followers != null && first?.followers != null ? latest.followers - first.followers : null,
    });
  }

  const posts = await db.socialPost.findMany({
    where: { socialAccountId: { in: accounts.map((account) => account.id) }, postedAt: { gte: since } },
    orderBy: { postedAt: "desc" },
    take: 300,
    select: {
      id: true,
      platform: true,
      productType: true,
      caption: true,
      permalink: true,
      thumbnailUrl: true,
      postedAt: true,
      snapshots: {
        orderBy: { capturedAt: "asc" },
        select: { hoursSincePost: true, views: true, reach: true, likes: true, comments: true, shares: true, saves: true, totalInteractions: true, avgWatchTimeMs: true },
      },
    },
  });

  const medianViews: SocialSummary["medianViews"] = {};
  for (const platform of Array.from(new Set(posts.map((post) => post.platform)))) {
    medianViews[platform as SocialPlatform] = median(posts.filter((post) => post.platform === platform).map((post) => post.snapshots.at(-1)?.views ?? NaN));
  }

  const postSummaries = posts.map((post) => {
    const last = post.snapshots.at(-1);
    const views = last?.views ?? null;
    const [h3, h24, d7] = CURVE_POINTS_HOURS.map((hours) => viewsAt(post.snapshots, hours));
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
      avgWatchTimeMs: last?.avgWatchTimeMs ?? null,
      engagementRate: last ? engagementRate(last) : null,
      views3h: h3,
      views24h: h24,
      views7d: d7,
      multiplier: outlierMultiplier(views, medianViews[post.platform] ?? null),
    };
  });

  return { days, accounts: accountSummaries, posts: postSummaries, medianViews };
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
