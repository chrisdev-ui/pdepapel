import { describe, expect, it } from "vitest";

import {
  engagementRate,
  INSTAGRAM_POST_METRICS,
  instagramProductType,
  instagramThumbnail,
  median,
  outlierMultiplier,
  pickAccountMetrics,
  pickMetrics,
  shouldPollPost,
  TIKTOK_POST_METRICS,
  viewsAt,
} from "@/lib/social/metrics";

const now = new Date("2026-10-21T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("métricas de redes", () => {
  it("guarda solo métricas permitidas y numéricas; nada de personas ni textos", () => {
    const picked = pickMetrics(
      { views: 1200, reach: 900.4, likes: 50, saved: 7, comments: "12", commenters: [{ username: "alguien" }], caption: "hola", ig_reels_avg_watch_time: 5321.7, impressions: 99 },
      INSTAGRAM_POST_METRICS,
    );
    expect(picked.columns).toEqual({ views: 1200, reach: 900, likes: 50, saves: 7, avgWatchTimeMs: 5322 });
    expect(picked.raw).toEqual({ views: 1200, reach: 900.4, likes: 50, saved: 7, ig_reels_avg_watch_time: 5321.7 });
    expect(JSON.stringify(picked)).not.toMatch(/alguien|hola|impressions/);

    expect(pickMetrics({ view_count: 10, like_count: 2, title: "x" }, TIKTOK_POST_METRICS).columns).toEqual({ views: 10, likes: 2 });
    expect(pickAccountMetrics({ followers_count: 300, username: "pdepapel", follower_count: 300, profile_views: 4 }).raw).toEqual({ followers_count: 300, follower_count: 300 });
  });

  it("cada corrida pide las de 30 días; hasta un año, una vez al día; después, nunca", () => {
    expect(shouldPollPost({ postedAt: daysAgo(2), metricsSyncedAt: new Date(now.getTime() - 60_000) }, now)).toBe(true);
    expect(shouldPollPost({ postedAt: daysAgo(40), metricsSyncedAt: new Date(now.getTime() - 6 * 3_600_000) }, now)).toBe(false);
    expect(shouldPollPost({ postedAt: daysAgo(40), metricsSyncedAt: daysAgo(1) }, now)).toBe(true);
    expect(shouldPollPost({ postedAt: daysAgo(40), metricsSyncedAt: null }, now)).toBe(true);
    expect(shouldPollPost({ postedAt: daysAgo(400), metricsSyncedAt: null }, now)).toBe(false);
  });

  it("tipo y miniatura de Instagram", () => {
    expect(instagramProductType("VIDEO", "REELS")).toBe("REELS");
    expect(instagramProductType("CAROUSEL_ALBUM", "FEED")).toBe("CAROUSEL");
    expect(instagramProductType("IMAGE", "FEED")).toBe("FEED");
    expect(instagramThumbnail({ media_type: "VIDEO", thumbnail_url: "https://t" })).toBe("https://t");
    expect(instagramThumbnail({ media_type: "IMAGE", media_url: "https://m" })).toBe("https://m");
    expect(instagramThumbnail({ media_type: "VIDEO", media_url: "https://video.mp4" })).toBeNull();
  });

  it("vistas a ~3 h / 24 h / 7 d: la foto más cercana en rango, o null", () => {
    const curve = [
      { hoursSincePost: 2.5, views: 100 },
      { hoursSincePost: 8, views: 300 },
      { hoursSincePost: 26, views: 900 },
    ];
    expect(viewsAt(curve, 3)).toBe(100);
    expect(viewsAt(curve, 24)).toBe(900);
    expect(viewsAt(curve, 168)).toBeNull();
  });

  it("mediana, multiplicador y tasa de interacción", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(outlierMultiplier(500, 100)).toBe(5);
    expect(outlierMultiplier(500, 0)).toBeNull();
    expect(engagementRate({ reach: 1000, views: 2000, totalInteractions: 55, likes: null, comments: null, shares: null, saves: null })).toBe(5.5);
    expect(engagementRate({ reach: null, views: 200, totalInteractions: null, likes: 10, comments: 2, shares: 1, saves: null })).toBe(6.5);
    expect(engagementRate({ reach: null, views: null, totalInteractions: 3, likes: null, comments: null, shares: null, saves: null })).toBeNull();
  });
});
