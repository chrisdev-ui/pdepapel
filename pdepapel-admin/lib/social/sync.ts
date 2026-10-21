import { Prisma, SocialAccountStatus, type SocialPlatform, type SocialProductType } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { SocialReconnectRequired } from "./credentials";
import { SocialApiError } from "./errors";
import { DAILY_WINDOW_DAYS, hoursSince, pickAccountMetrics, shouldPollPost, type MetricValues } from "./metrics";

/**
 * Una pasada de sincronización por cuenta, con presupuesto de tiempo. Primero
 * la cuenta y la lista de publicaciones (renueva miniaturas y textos), luego las
 * métricas de las publicaciones que tocan. Si se acaba el tiempo o la API pide
 * esperar, devuelve dónde seguir; la cola vuelve a llamar con ese punto.
 */
export interface NormalizedPost {
  externalId: string;
  mediaType: string | null;
  productType: SocialProductType | null;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  postedAt: Date;
  /** TikTok trae los contadores con la lista; Instagram los pide aparte. */
  metrics?: MetricValues;
}

export interface SocialAdapter {
  platform: SocialPlatform;
  fetchAccount(): Promise<{ externalId: string; username: string | null; pageId?: string | null; metrics: Record<string, unknown> }>;
  /** Más recientes primero; `next` null al terminar. */
  listPosts(cursor: string | null): Promise<{ posts: NormalizedPost[]; next: string | null }>;
  fetchPostMetrics?(externalId: string, post: { productType: SocialProductType | null; mediaType: string | null }): Promise<MetricValues>;
}

export type SyncPhase = "list" | "metrics";

export interface SyncContinuation {
  phase: SyncPhase;
  /** Inicio de la corrida: una publicación con métricas posteriores ya se hizo en esta corrida. */
  runStartedAt: string;
  listCursor?: string | null;
}

export type SyncOutcome =
  | { status: "done"; posts: number; snapshots: number }
  | { status: "continue"; posts: number; snapshots: number; next: SyncContinuation; delaySeconds: number }
  | { status: "reconnect"; reason: string }
  | { status: "failed"; reason: string };

const DAY = 86_400_000;
const sliceText = (value: string | null, max: number) => (value ? value.slice(0, max) : null);

function snapshotData(postId: string, postedAt: Date, values: MetricValues, now: Date): Prisma.SocialMetricSnapshotCreateManyInput {
  const { columns, raw } = values;
  return {
    socialPostId: postId,
    capturedAt: now,
    hoursSincePost: Math.round(hoursSince(postedAt, now) * 100) / 100,
    views: columns.views ?? null,
    reach: columns.reach ?? null,
    likes: columns.likes ?? null,
    comments: columns.comments ?? null,
    shares: columns.shares ?? null,
    saves: columns.saves ?? null,
    totalInteractions: columns.totalInteractions ?? null,
    avgWatchTimeMs: columns.avgWatchTimeMs ?? null,
    totalWatchTimeMs: columns.totalWatchTimeMs !== undefined ? BigInt(columns.totalWatchTimeMs) : null,
    skipRate: columns.skipRate ?? null,
    raw: Object.keys(raw).length ? raw : Prisma.JsonNull,
  };
}

export async function markAccountStatus(accountId: string, status: SocialAccountStatus, reason: string | null) {
  await prismadb.socialAccount.update({ where: { id: accountId }, data: { status, statusReason: reason?.slice(0, 191) ?? null } });
}

export async function runSocialSync(input: {
  accountId: string;
  adapter: SocialAdapter;
  continuation?: SyncContinuation | null;
  budgetMs?: number;
  now?: () => Date;
}): Promise<SyncOutcome> {
  const clock = input.now ?? (() => new Date());
  const startedAt = clock();
  const deadline = startedAt.getTime() + (input.budgetMs ?? 45_000);
  const runStartedAt = input.continuation ? new Date(input.continuation.runStartedAt) : startedAt;
  const outOfTime = () => clock().getTime() >= deadline;
  let posts = 0;
  let snapshots = 0;
  const pause = (next: Omit<SyncContinuation, "runStartedAt">, delaySeconds: number): SyncOutcome => ({
    status: "continue",
    posts,
    snapshots,
    next: { ...next, runStartedAt: runStartedAt.toISOString() },
    delaySeconds,
  });

  const account = await prismadb.socialAccount.findUniqueOrThrow({ where: { id: input.accountId }, select: { id: true, externalId: true, platform: true } });

  let phase: SyncPhase = input.continuation?.phase ?? "list";
  let listCursor = input.continuation?.listCursor ?? null;
  try {

    if (phase === "list") {
      if (!input.continuation) {
        const info = await input.adapter.fetchAccount();
        if (info.externalId !== account.externalId) {
          await markAccountStatus(account.id, SocialAccountStatus.NEEDS_RECONNECT, "account_changed");
          return { status: "reconnect", reason: "account_changed" };
        }
        const picked = pickAccountMetrics(info.metrics);
        await prismadb.$transaction([
          prismadb.socialAccount.update({
            where: { id: account.id },
            data: { username: sliceText(info.username, 191), pageId: info.pageId ?? undefined, status: SocialAccountStatus.OK, statusReason: null },
          }),
          prismadb.socialAccountSnapshot.create({
            data: { socialAccountId: account.id, capturedAt: clock(), ...picked.columns, raw: Object.keys(picked.raw).length ? picked.raw : Prisma.JsonNull },
          }),
        ]);
      }

      const oldest = new Date(clock().getTime() - DAILY_WINDOW_DAYS * DAY);
      for (;;) {
        if (outOfTime()) return pause({ phase: "list", listCursor }, 0);
        const page = await input.adapter.listPosts(listCursor);
        const now = clock();
        for (const post of page.posts) {
          if (post.postedAt < oldest) continue;
          const fields = {
            mediaType: sliceText(post.mediaType, 40),
            productType: post.productType,
            caption: post.caption,
            permalink: sliceText(post.permalink, 512),
            thumbnailUrl: post.thumbnailUrl,
            thumbnailCheckedAt: now,
            durationSec: post.durationSec,
            postedAt: post.postedAt,
          };
          const row = await prismadb.socialPost.upsert({
            where: { socialAccountId_externalId: { socialAccountId: account.id, externalId: post.externalId } },
            create: { socialAccountId: account.id, platform: account.platform, externalId: post.externalId, ...fields },
            update: fields,
            select: { id: true, metricsSyncedAt: true },
          });
          posts += 1;
          if (post.metrics && shouldPollPost({ postedAt: post.postedAt, metricsSyncedAt: row.metricsSyncedAt }, now)) {
            await prismadb.$transaction([
              prismadb.socialMetricSnapshot.create({ data: snapshotData(row.id, post.postedAt, post.metrics, now) }),
              prismadb.socialPost.update({ where: { id: row.id }, data: { metricsSyncedAt: now } }),
            ]);
            snapshots += 1;
          }
        }
        const reachedOld = page.posts.some((post) => post.postedAt < oldest);
        if (!page.next || reachedOld) break;
        listCursor = page.next;
      }
      phase = "metrics";
    }

    if (phase === "metrics" && input.adapter.fetchPostMetrics) {
      const candidates = await prismadb.socialPost.findMany({
        where: {
          socialAccountId: account.id,
          postedAt: { gte: new Date(clock().getTime() - DAILY_WINDOW_DAYS * DAY) },
          OR: [{ metricsSyncedAt: null }, { metricsSyncedAt: { lt: runStartedAt } }],
        },
        orderBy: { postedAt: "desc" },
        select: { id: true, externalId: true, postedAt: true, metricsSyncedAt: true, productType: true, mediaType: true },
        take: 500,
      });
      for (const post of candidates) {
        if (!shouldPollPost(post, runStartedAt)) continue;
        if (outOfTime()) return pause({ phase: "metrics" }, 0);
        const values = await input.adapter.fetchPostMetrics(post.externalId, post);
        const now = clock();
        await prismadb.$transaction([
          prismadb.socialMetricSnapshot.create({ data: snapshotData(post.id, post.postedAt, values, now) }),
          prismadb.socialPost.update({ where: { id: post.id }, data: { metricsSyncedAt: now } }),
        ]);
        snapshots += 1;
      }
    }

    await prismadb.socialAccount.update({ where: { id: account.id }, data: { lastSyncAt: clock() } });
    return { status: "done", posts, snapshots };
  } catch (error) {
    if (error instanceof SocialReconnectRequired) {
      await markAccountStatus(account.id, SocialAccountStatus.NEEDS_RECONNECT, error.reason);
      return { status: "reconnect", reason: error.reason };
    }
    if (error instanceof SocialApiError && error.kind === "auth") {
      await markAccountStatus(account.id, SocialAccountStatus.NEEDS_RECONNECT, error.code);
      return { status: "reconnect", reason: error.code };
    }
    if (error instanceof SocialApiError && error.kind === "rate_limit") {
      return pause(phase === "list" ? { phase, listCursor } : { phase }, Math.max(60, error.retryAfterSeconds ?? 300));
    }
    const reason = error instanceof SocialApiError ? error.code : "unexpected";
    return { status: "failed", reason };
  }
}
