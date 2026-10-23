import { SocialAccountStatus, SocialPlatform } from "@prisma/client";

import { recordJobRun, socialJobName } from "@/lib/job-runs";
import prismadb from "@/lib/prismadb";

import { getInstagramConfig, getTikTokConfig, INSTAGRAM_TOKEN_REF } from "./config";
import { getTikTokAccessToken } from "./credentials";
import { createInstagramAdapter } from "./graph";
import { shouldPollPost } from "./metrics";
import { enqueueSocialSync, type SocialSyncMessage } from "./queue";
import { markAccountStatus, runRecentSync, runSocialSync, type SocialAdapter, type SyncOutcome } from "./sync";
import { createTikTokAdapter, refreshTikTokTokens } from "./tiktok";

/** Cuentas conectadas que la corrida programada sincroniza (no las que piden reconectar ni las apagadas). */
export type PlatformFilter = "all" | "instagram" | "tiktok";

const platformWhere = (filter: PlatformFilter) =>
  filter === "instagram" ? { platform: SocialPlatform.INSTAGRAM } : filter === "tiktok" ? { platform: SocialPlatform.TIKTOK } : {};

export function adapterForAccount(account: { storeId: string; platform: SocialPlatform; externalId: string; tokenRef: string | null }): SocialAdapter | null {
  if (account.platform === SocialPlatform.INSTAGRAM) {
    const config = getInstagramConfig();
    if (!config || account.tokenRef !== INSTAGRAM_TOKEN_REF) return null;
    return createInstagramAdapter({ pageToken: config.pageToken, igUserId: account.externalId });
  }
  const config = getTikTokConfig();
  if (!config) return null;
  return createTikTokAdapter({
    getAccessToken: () => getTikTokAccessToken(account.storeId, { key: config.encryptionKey, refresh: (refreshToken) => refreshTikTokTokens(config, refreshToken) }),
  });
}

/** Simulación: cuentas, si están configuradas y cuántas publicaciones tocarían. Sin llamar a Meta ni a TikTok. */
export async function planSocialSync(filter: PlatformFilter = "all", now = new Date()) {
  const accounts = await prismadb.socialAccount.findMany({
    where: platformWhere(filter),
    select: { id: true, storeId: true, platform: true, status: true, externalId: true, tokenRef: true, lastSyncAt: true, posts: { select: { postedAt: true, metricsSyncedAt: true } } },
  });
  return accounts.map((account) => ({
    accountId: account.id,
    platform: account.platform,
    status: account.status,
    configured: adapterForAccount(account) !== null,
    lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
    posts: account.posts.length,
    postsDue: account.posts.filter((post) => shouldPollPost(post, now)).length,
  }));
}

export async function startSocialSync(filter: PlatformFilter = "all") {
  const accounts = await prismadb.socialAccount.findMany({ where: { ...platformWhere(filter), status: SocialAccountStatus.OK }, select: { id: true } });
  let enqueued = 0;
  for (const account of accounts) {
    if (await enqueueSocialSync({ accountId: account.id })) enqueued += 1;
  }
  return { accounts: accounts.length, enqueued };
}

/** Atiende un mensaje de la cola: corre la pasada y, si quedó pendiente, se vuelve a encolar. */
export async function processSocialSyncMessage(message: SocialSyncMessage, options: { adapter?: SocialAdapter | null; budgetMs?: number } = {}): Promise<SyncOutcome | { status: "skipped"; reason: string }> {
  const account = await prismadb.socialAccount.findUnique({ where: { id: message.accountId }, select: { id: true, storeId: true, platform: true, externalId: true, tokenRef: true, status: true } });
  if (!account) return { status: "skipped", reason: "account_missing" };
  if (account.status !== SocialAccountStatus.OK) return { status: "skipped", reason: `status_${account.status.toLowerCase()}` };
  const adapter = options.adapter === undefined ? adapterForAccount(account) : options.adapter;
  if (!adapter) {
    await markAccountStatus(account.id, SocialAccountStatus.OK, "not_configured");
    await recordJobRun(socialJobName(account.platform), { ok: false, storeId: account.storeId, detail: "Falta configurar la red en el servidor (not_configured)" });
    return { status: "skipped", reason: "not_configured" };
  }

  const outcome = await runSocialSync({ accountId: account.id, adapter, continuation: message.continuation, budgetMs: options.budgetMs });
  if (outcome.status === "continue") {
    await enqueueSocialSync({ accountId: account.id, continuation: outcome.next }, outcome.delaySeconds);
  }
  if (outcome.status === "done" || outcome.status === "failed" || outcome.status === "reconnect") {
    await recordJobRun(socialJobName(account.platform), {
      ok: outcome.status === "done",
      storeId: account.storeId,
      detail:
        outcome.status === "done"
          ? `${outcome.posts} publicaciones revisadas, ${outcome.snapshots} mediciones`
          : `${outcome.status === "reconnect" ? "Hay que volver a conectar" : "Falló"} (${outcome.reason})`,
    });
  }
  return outcome;
}

/**
 * El refresco de cada hora (cron de Vercel): cuentas conectadas, una a la vez,
 * con su parte del presupuesto de la función. Sin cola. Un fallo de una cuenta
 * no frena las demás; la próxima hora se intenta de nuevo.
 */
export async function runRecentRefresh(options: { budgetMs?: number; adapterFor?: typeof adapterForAccount } = {}) {
  const accounts = await prismadb.socialAccount.findMany({
    where: { status: SocialAccountStatus.OK },
    select: { id: true, storeId: true, platform: true, externalId: true, tokenRef: true },
  });
  const budget = Math.floor((options.budgetMs ?? 45_000) / Math.max(1, accounts.length));
  const results: { platform: SocialPlatform; status: string; posts?: number; snapshots?: number; reason?: string }[] = [];
  for (const account of accounts) {
    const adapter = (options.adapterFor ?? adapterForAccount)(account);
    if (!adapter) {
      results.push({ platform: account.platform, status: "skipped", reason: "not_configured" });
      continue;
    }
    const outcome = await runRecentSync({ accountId: account.id, adapter, budgetMs: budget });
    results.push(
      outcome.status === "done"
        ? { platform: account.platform, status: "done", posts: outcome.posts, snapshots: outcome.snapshots }
        : { platform: account.platform, status: outcome.status, reason: "reason" in outcome ? outcome.reason : undefined },
    );
  }
  await recordJobRun("social-recent", recentRunSummary(results));
  return { accounts: accounts.length, results };
}

const NETWORK = { INSTAGRAM: "Instagram", TIKTOK: "TikTok" } as const;

/** La fila de «Sistemas»: cuántas publicaciones se midieron y, si algo falló, qué red y por qué. */
export function recentRunSummary(results: { platform: SocialPlatform; status: string; posts?: number; snapshots?: number; reason?: string }[]) {
  const failed = results.filter((result) => result.status !== "done" && result.status !== "skipped");
  const unconfigured = results.filter((result) => result.status === "skipped");
  const measured = results.reduce((sum, result) => sum + (result.snapshots ?? 0), 0);
  const parts = [results.length ? `${measured} ${measured === 1 ? "publicación medida" : "publicaciones medidas"}` : "Sin cuentas conectadas"];
  for (const result of failed) parts.push(`${NETWORK[result.platform]}: ${result.status === "reconnect" ? "hay que volver a conectar" : "falló"} (${result.reason ?? "sin detalle"})`);
  for (const result of unconfigured) parts.push(`${NETWORK[result.platform]}: sin configurar en el servidor`);
  // Como en las filas de cada 6 h, una red conectada sin configuración en el servidor es un fallo, no un salto.
  return { ok: failed.length === 0 && unconfigured.length === 0, detail: parts.join(" · ") };
}
