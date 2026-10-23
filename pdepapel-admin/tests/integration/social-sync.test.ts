import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => ({ enqueued: [] as unknown[] }));
vi.mock("@/lib/social/queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social/queue")>()),
  enqueueSocialSync: vi.fn(async (message: unknown, delaySeconds = 0) => {
    queue.enqueued.push({ message, delaySeconds });
    return true;
  }),
}));

import { GET as recentGET } from "@/app/api/cron/social-recent/route";
import { GET as cronGET } from "@/app/api/cron/social-sync/route";
import { getTikTokAccessToken, saveTikTokCredential, SocialReconnectRequired, type TikTokTokenSet } from "@/lib/social/credentials";
import { SocialApiError } from "@/lib/social/errors";
import { INSTAGRAM_POST_METRICS, pickMetrics } from "@/lib/social/metrics";
import { consumeSocialOAuthState, createSocialOAuthState } from "@/lib/social/oauth-state";
import { processSocialSyncMessage, recentRunSummary, runRecentRefresh } from "@/lib/social/runner";
import { buildSocialSummary, getSocialPostCurve } from "@/lib/social/report";
import { MAX_DURATION_PROBES_PER_PASS, runRecentSync, runSocialSync, type NormalizedPost, type SocialAdapter } from "@/lib/social/sync";

import { TEST_ENV_STUBS } from "../../scripts/lib/test-isolation.mjs";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Sincronización de redes contra la base de pruebas, con adaptadores doblados:
 * nada sale a Meta ni a TikTok.
 */
let f: InventoryFixture | undefined;
const KEY = Buffer.alloc(32, 9);
const HOUR = 3_600_000;
const now = new Date("2026-10-21T12:00:00Z");

const post = (id: string, hoursAgo: number, extra: Partial<NormalizedPost> = {}): NormalizedPost => ({
  externalId: id,
  mediaType: "VIDEO",
  productType: "REELS",
  caption: `Reel ${id}`,
  permalink: `https://www.instagram.com/reel/${id}`,
  thumbnailUrl: `https://cdn.example/${id}-v1.jpg`,
  durationSec: null,
  postedAt: new Date(now.getTime() - hoursAgo * HOUR),
  ...extra,
});

function fakeInstagram(pages: NormalizedPost[][], options: { metrics?: (id: string) => Promise<ReturnType<typeof pickMetrics>>; externalId?: string } = {}) {
  const calls = { list: 0, metrics: [] as string[] };
  const adapter: SocialAdapter = {
    platform: "INSTAGRAM",
    fetchAccount: async () => ({ externalId: options.externalId ?? "ig1", username: "papeleria.pdepapel", pageId: "page1", metrics: { followers_count: 1234, username: "x" } }),
    listPosts: async (cursor) => {
      const index = cursor ? Number(cursor) : 0;
      calls.list += 1;
      return { posts: pages[index] ?? [], next: index + 1 < pages.length ? String(index + 1) : null };
    },
    fetchPostMetrics: async (id) => {
      calls.metrics.push(id);
      return options.metrics ? options.metrics(id) : pickMetrics({ views: 100, reach: 80, saved: 3, commenter_names: ["Ana"] }, INSTAGRAM_POST_METRICS);
    },
  };
  return { adapter, calls };
}

async function account(platform: "INSTAGRAM" | "TIKTOK" = "INSTAGRAM", status: "OK" | "NEEDS_RECONNECT" = "OK") {
  return testPrisma.socialAccount.create({ data: { storeId: f!.store.id, platform, externalId: platform === "INSTAGRAM" ? "ig1" : "open1", tokenRef: platform === "INSTAGRAM" ? "env:META_IG_PAGE_TOKEN" : "credential", status } });
}

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) {
    await testPrisma.socialOAuthState.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.socialCredential.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.socialAccount.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
  queue.enqueued = [];
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("pasada de sincronización", () => {
  it("guarda cuenta, publicaciones y mediciones; raw solo con métricas permitidas; la miniatura se renueva", async () => {
    f = await createInventoryFixture();
    const row = await account();
    const { adapter, calls } = fakeInstagram([[post("a", 2), post("b", 30)], [post("c", 24 * 40), post("old", 24 * 400)]]);

    const outcome = await runSocialSync({ accountId: row.id, adapter, now: () => now });
    expect(outcome).toMatchObject({ status: "done", posts: 3, snapshots: 3 });
    expect(calls.metrics.sort()).toEqual(["a", "b", "c"]);

    const snapshot = await testPrisma.socialMetricSnapshot.findFirstOrThrow({ where: { post: { externalId: "a", socialAccountId: row.id } } });
    expect(snapshot).toMatchObject({ views: 100, reach: 80, saves: 3, hoursSincePost: 2 });
    expect(snapshot.raw).toEqual({ views: 100, reach: 80, saved: 3 });
    expect(JSON.stringify(snapshot.raw)).not.toContain("Ana");
    const accountSnap = await testPrisma.socialAccountSnapshot.findFirstOrThrow({ where: { socialAccountId: row.id } });
    expect(accountSnap).toMatchObject({ followers: 1234 });
    expect(await testPrisma.socialPost.count({ where: { socialAccountId: row.id, externalId: "old" } })).toBe(0);

    // Segunda corrida 6 h después: miniatura nueva; la de 40 días ya no toca (una vez al día).
    const later = new Date(now.getTime() + 6 * HOUR);
    const second = fakeInstagram([[post("a", 2, { thumbnailUrl: "https://cdn.example/a-v2.jpg" }), post("b", 30)], [post("c", 24 * 40)]]);
    await runSocialSync({ accountId: row.id, adapter: second.adapter, now: () => later });
    expect(second.calls.metrics.sort()).toEqual(["a", "b"]);
    expect((await testPrisma.socialPost.findFirstOrThrow({ where: { socialAccountId: row.id, externalId: "a" } })).thumbnailUrl).toBe("https://cdn.example/a-v2.jpg");
    expect((await testPrisma.socialAccount.findUniqueOrThrow({ where: { id: row.id } })).lastSyncAt).toEqual(later);
  });

  it("sin tiempo deja una continuación; la continuación hace solo lo que faltó", async () => {
    f = await createInventoryFixture();
    const row = await account();
    let tick = now.getTime();
    const clock = () => new Date((tick += 1000));
    const { adapter } = fakeInstagram([[post("a", 2), post("b", 3), post("c", 4)]]);

    const first = await runSocialSync({ accountId: row.id, adapter, budgetMs: 3500, now: clock });
    expect(first).toMatchObject({ status: "continue", next: { phase: "metrics" } });
    const done = (await testPrisma.socialMetricSnapshot.count({ where: { post: { socialAccountId: row.id } } }));
    expect(done).toBeGreaterThanOrEqual(0);

    const rest = fakeInstagram([[post("a", 2), post("b", 3), post("c", 4)]]);
    const second = await runSocialSync({ accountId: row.id, adapter: rest.adapter, continuation: first.status === "continue" ? first.next : null, now: clock });
    expect(second.status).toBe("done");
    expect(rest.calls.list).toBe(0);
    expect(await testPrisma.socialMetricSnapshot.count({ where: { post: { socialAccountId: row.id } } })).toBe(3);
    expect(done + rest.calls.metrics.length).toBe(3);
  });

  it("un límite de la API pausa con retraso; un token inválido o una cuenta cambiada piden reconectar", async () => {
    f = await createInventoryFixture();
    const row = await account();
    const limited = fakeInstagram([[post("a", 2), post("b", 3)]], {
      metrics: async (id) => {
        if (id === "b") throw new SocialApiError("INSTAGRAM", "rate_limit", "meta_80002", 400, 900);
        return pickMetrics({ views: 1 }, INSTAGRAM_POST_METRICS);
      },
    });
    expect(await runSocialSync({ accountId: row.id, adapter: limited.adapter, now: () => now })).toMatchObject({ status: "continue", delaySeconds: 900, next: { phase: "metrics" } });

    const expired = fakeInstagram([[post("a", 2)]], { metrics: async () => { throw new SocialApiError("INSTAGRAM", "auth", "meta_190", 400); } });
    expect(await runSocialSync({ accountId: row.id, adapter: expired.adapter, now: () => now })).toEqual({ status: "reconnect", reason: "meta_190" });
    expect(await testPrisma.socialAccount.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "NEEDS_RECONNECT", statusReason: "meta_190" });

    await testPrisma.socialAccount.update({ where: { id: row.id }, data: { status: "OK", statusReason: null } });
    const other = fakeInstagram([[]], { externalId: "ig-otra" });
    expect(await runSocialSync({ accountId: row.id, adapter: other.adapter, now: () => now })).toEqual({ status: "reconnect", reason: "account_changed" });
  });

  it("la cola: cuentas por reconectar se saltan; una continuación vuelve a la cola con su retraso", async () => {
    f = await createInventoryFixture();
    const blocked = await account("TIKTOK", "NEEDS_RECONNECT");
    expect(await processSocialSyncMessage({ accountId: blocked.id }, { adapter: fakeInstagram([[]]).adapter })).toEqual({ status: "skipped", reason: "status_needs_reconnect" });

    const row = await account();
    const limited = fakeInstagram([[post("a", 2)]], { metrics: async () => { throw new SocialApiError("INSTAGRAM", "rate_limit", "meta_4", 400, 600); } });
    await processSocialSyncMessage({ accountId: row.id }, { adapter: limited.adapter });
    expect(queue.enqueued).toEqual([{ message: { accountId: row.id, continuation: expect.objectContaining({ phase: "metrics" }) }, delaySeconds: 600 }]);
    expect(await processSocialSyncMessage({ accountId: row.id }, { adapter: null })).toEqual({ status: "skipped", reason: "not_configured" });
  });
});

describe("resumen (página y social:report)", () => {
  it("vistas a 3 h / 24 h, «pocos datos» con menos de 5 para comparar, seguidores ganados; sin token, tokenRef ni raw", async () => {
    f = await createInventoryFixture();
    const row = await account();
    const views: Record<string, number[]> = { a: [50, 400], b: [20, 100], c: [30, 100] };
    let run = 0;
    const adapterFor = () =>
      fakeInstagram([[post("a", 3), post("b", 4), post("c", 5)]], { metrics: async (id) => pickMetrics({ views: views[id][run], reach: 50, total_interactions: 5 }, INSTAGRAM_POST_METRICS) }).adapter;
    await runSocialSync({ accountId: row.id, adapter: adapterFor(), now: () => now });
    run = 1;
    const later = new Date(now.getTime() + 21 * HOUR);
    await runSocialSync({ accountId: row.id, adapter: { ...adapterFor(), fetchAccount: async () => ({ externalId: "ig1", username: "papeleria.pdepapel", metrics: { followers_count: 1300 } }) }, now: () => later });

    const summary = await buildSocialSummary(testPrisma, { storeId: f.store.id, days: 7, now: later });
    expect(summary.accounts[0]).toMatchObject({ platform: "INSTAGRAM", followers: 1300, followersDelta: 66 });
    // Dos lecturas en días distintos de Bogotá: la serie diaria y, sin una semana de historia, sin cambio a 7 ni a 30 días.
    expect(summary.accounts[0].followersDaily).toMatchObject({ delta7: null, delta30: null, since: expect.any(String) });
    expect(summary.accounts[0].followersDaily.series.map((day) => day.followers)).toEqual([1234, 1300]);
    const a = summary.posts.find((p) => p.caption === "Reel a")!;
    // «× mediana» a la misma edad: con solo 2 publicaciones para comparar es «pocos datos» (null), no 4×.
    expect(a).toMatchObject({ views: 400, views3h: 50, views24h: 400, multiplier: null, multiplierSample: 2, engagementRate: 10 });
    expect(summary.medianViews.INSTAGRAM).toBe(100);
    expect(JSON.stringify(summary)).not.toMatch(/tokenRef|encrypted|"raw"|META_IG/);

    expect(await getSocialPostCurve(testPrisma, f.store.id, a.id)).toHaveLength(2);
    expect(await getSocialPostCurve(testPrisma, "otra-tienda", a.id)).toBeNull();
    expect((await buildSocialSummary(testPrisma, { storeId: f.store.id, days: 9999, now: later })).days).toBe(90);
  });
});

describe("credenciales de TikTok", () => {
  const tokens = (n: number): TikTokTokenSet => ({ accessToken: `act.${n}`, refreshToken: `rft.${n}`, expiresIn: 86_400, refreshExpiresIn: 31_536_000, scope: "video.list", openId: "open1" });

  it("se guardan cifradas; se refrescan cerca del vencimiento; un refresco concurrente no pisa el token", async () => {
    f = await createInventoryFixture();
    await saveTikTokCredential(f.store.id, tokens(1), KEY, now);
    const stored = await testPrisma.socialCredential.findFirstOrThrow({ where: { storeId: f.store.id } });
    expect(`${stored.encryptedAccessToken}${stored.encryptedRefreshToken}`).not.toMatch(/act\.1|rft\.1/);

    const refresh = vi.fn(async () => tokens(2));
    expect(await getTikTokAccessToken(f.store.id, { key: KEY, refresh, now })).toBe("act.1");
    expect(refresh).not.toHaveBeenCalled();

    const nearExpiry = new Date(now.getTime() + 86_400_000 - 30_000);
    expect(await getTikTokAccessToken(f.store.id, { key: KEY, refresh, now: nearExpiry })).toBe("act.2");
    expect(refresh).toHaveBeenCalledWith("rft.1");

    // Otra corrida refrescó mientras esta esperaba: gana la versión guardada.
    const racing = vi.fn(async () => {
      await saveTikTokCredential(f!.store.id, tokens(4), KEY, nearExpiry);
      return tokens(3);
    });
    await testPrisma.socialCredential.update({ where: { id: stored.id }, data: { accessTokenExpiresAt: now } });
    expect(await getTikTokAccessToken(f.store.id, { key: KEY, refresh: racing, now: nearExpiry })).toBe("act.4");
  });

  it("sin credencial o con el refresh vencido pide reconectar", async () => {
    f = await createInventoryFixture();
    await expect(getTikTokAccessToken(f.store.id, { key: KEY, refresh: vi.fn() })).rejects.toBeInstanceOf(SocialReconnectRequired);
    await saveTikTokCredential(f.store.id, { ...tokens(1), expiresIn: 0, refreshExpiresIn: 0 }, KEY, now);
    await expect(getTikTokAccessToken(f.store.id, { key: KEY, refresh: vi.fn(), now: new Date(now.getTime() + 1000) })).rejects.toMatchObject({ reason: "tiktok_refresh_expired" });
  });
});

describe("state de OAuth", () => {
  it("se usa una sola vez, vence y no sirve para otra red; el verifier no queda en claro", async () => {
    f = await createInventoryFixture();
    const { state, codeVerifier } = await createSocialOAuthState({ storeId: f.store.id, platform: "TIKTOK", createdBy: "owner", encryptionKey: KEY });
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
    const row = await testPrisma.socialOAuthState.findFirstOrThrow({ where: { storeId: f.store.id } });
    expect(row.encryptedCodeVerifier).not.toContain(codeVerifier);
    expect(row.stateHash).not.toBe(state);

    expect(await consumeSocialOAuthState(state, "INSTAGRAM", KEY)).toBeNull();
    expect(await consumeSocialOAuthState(state, "TIKTOK", KEY)).toEqual({ storeId: f.store.id, createdBy: "owner", codeVerifier });
    expect(await consumeSocialOAuthState(state, "TIKTOK", KEY)).toBeNull();

    const late = await createSocialOAuthState({ storeId: f.store.id, platform: "TIKTOK", createdBy: "owner", encryptionKey: KEY });
    await testPrisma.socialOAuthState.updateMany({ where: { storeId: f.store.id, consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeSocialOAuthState(late.state, "TIKTOK", KEY)).toBeNull();
  });
});

describe("ruta del cron", () => {
  const call = (query = "", token: string | null = TEST_ENV_STUBS.CRON_SECRET, extra: Record<string, string> = {}) =>
    cronGET(new Request(`http://admin.test/api/cron/social-sync${query}`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra } }) as never);

  it("sin el secreto, 403; sin mode simula y no encola; con apply encola las cuentas conectadas", async () => {
    f = await createInventoryFixture();
    const connected = await account();
    const blocked = await testPrisma.socialAccount.create({ data: { storeId: f.store.id, platform: "TIKTOK", externalId: "open1", status: "NEEDS_RECONNECT" } });
    expect((await call("", null)).status).toBe(403);
    expect((await call("", "otro")).status).toBe(403);

    const dry = await call("?platform=instagram");
    expect(dry.status).toBe(200);
    const body = await dry.json();
    expect(body.mode).toBe("dry-run");
    expect(body.accounts.some((row: { platform: string }) => row.platform === "INSTAGRAM")).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/tokenRef|META_IG_PAGE_TOKEN|access/i);
    expect(queue.enqueued).toEqual([]);

    const apply = await call("?mode=apply");
    expect(apply.status).toBe(200);
    expect(await apply.json()).toMatchObject({ mode: "apply", accounts: expect.any(Number), enqueued: expect.any(Number) });
    expect(queue.enqueued).toContainEqual({ message: { accountId: connected.id }, delaySeconds: 0 });
    expect(queue.enqueued.map((entry) => (entry as { message: { accountId: string } }).message.accountId)).not.toContain(blocked.id);
    expect((await call("?platform=youtube")).status).toBe(400);
  });

  it("el cron de Vercel (encabezado, sin consulta) encola; sin el secreto, 403 aunque traiga el encabezado", async () => {
    f = await createInventoryFixture();
    const connected = await account();
    const cron = { "x-vercel-cron-schedule": "15 3,9,15,21 * * *" };
    expect((await call("", null, cron)).status).toBe(403);
    expect(queue.enqueued).toEqual([]);
    const run = await call("", TEST_ENV_STUBS.CRON_SECRET, cron);
    expect(run.status).toBe(200);
    expect(await run.json()).toMatchObject({ mode: "apply", platform: "all", enqueued: expect.any(Number) });
    expect(queue.enqueued).toContainEqual({ message: { accountId: connected.id }, delaySeconds: 0 });
    // Un dry-run explícito gana al encabezado.
    queue.enqueued.length = 0;
    expect(await (await call("?mode=dry-run", TEST_ENV_STUBS.CRON_SECRET, cron)).json()).toMatchObject({ mode: "dry-run" });
    expect(queue.enqueued).toEqual([]);
  });
});

describe("duración de los reels (encabezado del MP4)", () => {
  const reel = (id: string, hoursAgo: number) => post(id, hoursAgo, { mediaUrl: `https://cdn.example/${id}.mp4` });

  it("se lee una vez por reel, también si falla; un null de la lista no borra la que ya se leyó", async () => {
    f = await createInventoryFixture();
    const row = await account();
    const probed: string[] = [];
    const withProbe = (result: (url: string) => number | null) => {
      const { adapter } = fakeInstagram([[reel("a", 2), reel("b", 3), post("carrusel", 4, { productType: "CAROUSEL", mediaType: "CAROUSEL_ALBUM" })]]);
      return { ...adapter, probeDuration: async (url: string) => (probed.push(url), result(url)) };
    };
    await runSocialSync({ accountId: row.id, adapter: withProbe((url) => (url.endsWith("a.mp4") ? 21.5 : null)), now: () => now });
    expect(probed.sort()).toEqual(["https://cdn.example/a.mp4", "https://cdn.example/b.mp4"]);
    const stored = await testPrisma.socialPost.findMany({ where: { socialAccountId: row.id }, select: { externalId: true, durationSec: true, durationCheckedAt: true } });
    expect(Object.fromEntries(stored.map((item) => [item.externalId, [item.durationSec, item.durationCheckedAt !== null]]))).toEqual({ a: [21.5, true], b: [null, true], carrusel: [null, false] });

    probed.length = 0;
    await runSocialSync({ accountId: row.id, adapter: withProbe(() => 99), now: () => new Date(now.getTime() + 6 * HOUR) });
    expect(probed).toEqual([]);
    expect((await testPrisma.socialPost.findFirstOrThrow({ where: { socialAccountId: row.id, externalId: "a" } })).durationSec).toBe(21.5);
  });

  it("a lo sumo 3 por pasada y solo con 15 s o más de presupuesto; nunca frena la sincronización", async () => {
    f = await createInventoryFixture();
    const row = await account();
    const probed: string[] = [];
    const reels = Array.from({ length: 5 }, (_, index) => reel(`r${index}`, 2 + index));
    const { adapter } = fakeInstagram([reels]);
    const outcome = await runSocialSync({ accountId: row.id, adapter: { ...adapter, probeDuration: async (url) => (probed.push(url), 10) }, now: () => now });
    expect(outcome).toMatchObject({ status: "done", posts: 5 });
    expect(probed).toHaveLength(MAX_DURATION_PROBES_PER_PASS);

    // Misma cuenta externa que el adaptador doblado: la pasada sí recorre la lista, pero con 10 s no lee duraciones.
    const other = await testPrisma.socialAccount.create({ data: { storeId: f.store.id, platform: "TIKTOK", externalId: "ig1", tokenRef: "credential" } });
    const short: string[] = [];
    const tight = fakeInstagram([[reel("t1", 2)]]);
    expect(await runSocialSync({ accountId: other.id, adapter: { ...tight.adapter, probeDuration: async (url) => (short.push(url), 10) }, budgetMs: 10_000, now: () => now })).toMatchObject({ status: "done", posts: 1 });
    expect(short).toEqual([]);
  });
});

describe("refresco de cada hora (lo publicado en las últimas 8 h)", () => {
  it("mide solo lo de menos de 8 h, con la primera página, sin foto de la cuenta", async () => {
    f = await createInventoryFixture();
    const row = await account();
    const { adapter, calls } = fakeInstagram([[post("nuevo", 2), post("de-7h", 7), post("de-10h", 10)], [post("viejo", 48)]]);
    const outcome = await runRecentSync({ accountId: row.id, adapter, now: () => now });
    expect(outcome).toMatchObject({ status: "done", posts: 2, snapshots: 2 });
    expect(calls.list).toBe(1);
    expect(calls.metrics.sort()).toEqual(["de-7h", "nuevo"]);
    expect(await testPrisma.socialAccountSnapshot.count({ where: { socialAccountId: row.id } })).toBe(0);
    const snapshot = await testPrisma.socialMetricSnapshot.findFirstOrThrow({ where: { post: { externalId: "nuevo", socialAccountId: row.id } } });
    expect(snapshot.hoursSincePost).toBe(2);
  });

  it("TikTok usa los contadores de la lista; un token inválido pide reconectar", async () => {
    f = await createInventoryFixture();
    const row = await account("TIKTOK");
    const tiktok: SocialAdapter = {
      platform: "TIKTOK",
      fetchAccount: async () => ({ externalId: "open1", username: null, metrics: {} }),
      listPosts: async () => ({ posts: [post("v1", 3, { productType: "VIDEO", durationSec: 18, metrics: pickMetrics({ views: 70 }, INSTAGRAM_POST_METRICS) })], next: null }),
    };
    expect(await runRecentSync({ accountId: row.id, adapter: tiktok, now: () => now })).toMatchObject({ status: "done", snapshots: 1 });
    expect((await testPrisma.socialPost.findFirstOrThrow({ where: { socialAccountId: row.id } })).durationSec).toBe(18);
    const broken: SocialAdapter = { ...tiktok, listPosts: async () => { throw new SocialApiError("TIKTOK", "auth", "access_token_invalid", 401); } };
    expect(await runRecentSync({ accountId: row.id, adapter: broken, now: () => now })).toMatchObject({ status: "reconnect" });
  });

  it("la ruta: sin el secreto, 403; sin mode no llama a nadie; con apply recorre las cuentas conectadas", async () => {
    f = await createInventoryFixture();
    await account();
    const call = (query = "", token: string | null = TEST_ENV_STUBS.CRON_SECRET, extra: Record<string, string> = {}) =>
      recentGET(new Request(`http://admin.test/api/cron/social-recent${query}`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra } }) as never);
    expect((await call("", null)).status).toBe(403);
    expect(await (await call()).json()).toEqual({ mode: "dry-run" });
    // Lo que manda el cron de Vercel: el encabezado con la expresión, sin consulta.
    expect(await (await call("", TEST_ENV_STUBS.CRON_SECRET, { "x-vercel-cron-schedule": "5 * * * *" })).json()).toMatchObject({ mode: "apply", accounts: expect.any(Number) });
    expect((await call("", null, { "x-vercel-cron-schedule": "5 * * * *" })).status).toBe(403);
    const apply = await call("?mode=apply");
    expect(apply.status).toBe(200);
    expect(await apply.json()).toMatchObject({ mode: "apply", accounts: expect.any(Number) });

    await testPrisma.jobRun.deleteMany({ where: { name: "social-recent" } });
    const refreshed = await runRecentRefresh({ adapterFor: () => fakeInstagram([[post("x", 1)]]).adapter });
    expect(refreshed.results.some((result) => result.status === "done")).toBe(true);
    // Una sola fila global en Inicio › Sistemas, reescrita en cada corrida.
    const rows = await testPrisma.jobRun.findMany({ where: { name: "social-recent" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ storeId: null, ok: true, detail: expect.stringMatching(/^\d+ publicaci(ón medida|ones medidas)/) });
    await runRecentRefresh({ adapterFor: () => null });
    expect(await testPrisma.jobRun.findMany({ where: { name: "social-recent" } })).toEqual([expect.objectContaining({ ok: false, detail: expect.stringContaining("sin configurar en el servidor") })]);
  });

  it("la fila de Sistemas del refresco de cada hora dice cuántas se midieron y qué red falló", () => {
    expect(recentRunSummary([])).toEqual({ ok: true, detail: "Sin cuentas conectadas" });
    expect(recentRunSummary([{ platform: "INSTAGRAM", status: "done", posts: 3, snapshots: 1 }])).toEqual({ ok: true, detail: "1 publicación medida" });
    expect(
      recentRunSummary([
        { platform: "INSTAGRAM", status: "failed", reason: "meta_10" },
        { platform: "TIKTOK", status: "done", posts: 4, snapshots: 4 },
      ]),
    ).toEqual({ ok: false, detail: "4 publicaciones medidas · Instagram: falló (meta_10)" });
    expect(recentRunSummary([{ platform: "TIKTOK", status: "reconnect", reason: "token_revoked" }])).toEqual({
      ok: false,
      detail: "0 publicaciones medidas · TikTok: hay que volver a conectar (token_revoked)",
    });
    expect(recentRunSummary([{ platform: "TIKTOK", status: "skipped", reason: "not_configured" }])).toEqual({ ok: false, detail: "0 publicaciones medidas · TikTok: sin configurar en el servidor" });
  });
});

describe("retención en el resumen", () => {
  it("duración, salto y % visto llegan al resumen, con la alerta cuando la mayoría lo deja pronto", async () => {
    f = await createInventoryFixture();
    const row = await account();
    const { adapter } = fakeInstagram([[post("corto", 5), post("bien", 6)]], {
      metrics: async (id) =>
        pickMetrics(id === "corto" ? { views: 100, ig_reels_avg_watch_time: 2000, reels_skip_rate: 62.4 } : { views: 100, ig_reels_avg_watch_time: 9000, reels_skip_rate: 30 }, INSTAGRAM_POST_METRICS),
    });
    await runSocialSync({ accountId: row.id, adapter: { ...adapter, probeDuration: async () => 20 }, now: () => now });
    await testPrisma.socialPost.updateMany({ where: { socialAccountId: row.id }, data: { durationSec: 20 } });
    const summary = await buildSocialSummary(testPrisma, { storeId: f.store.id, days: 7, now });
    const byCaption = Object.fromEntries(summary.posts.map((item) => [item.caption, item]));
    expect(byCaption["Reel corto"]).toMatchObject({ durationSec: 20, skipRate: 62.4, watchedPct: 10, retentionWarning: true, retentionReasons: ["watched"], skipMedian: null });
    expect(byCaption["Reel bien"]).toMatchObject({ watchedPct: 45, retentionWarning: false });
    // Dos reels: sin mediana de la red, el salto no decide.
    expect(summary.skipBaselines.INSTAGRAM).toEqual({ median: null, count: 2 });
  });

  it("el salto alerta solo 10 puntos por encima de la mediana de la red en 90 días, aunque el reel quede fuera del periodo", async () => {
    f = await createInventoryFixture();
    const row = await account();
    const skips: Record<string, number> = { a: 60, b: 61, c: 62, d: 63, e: 64, alto: 73, viejo: 62 };
    const ids = Object.keys(skips);
    const { adapter } = fakeInstagram([ids.map((id, index) => post(id, index + 1))], {
      metrics: async (id) => pickMetrics({ views: 100, ig_reels_avg_watch_time: 9000, reels_skip_rate: skips[id] }, INSTAGRAM_POST_METRICS),
    });
    await runSocialSync({ accountId: row.id, adapter: { ...adapter, probeDuration: async () => 20 }, now: () => now });
    // «viejo» sale del periodo de 7 días pero sigue en la mediana de 90.
    await testPrisma.socialPost.updateMany({ where: { socialAccountId: row.id, externalId: "viejo" }, data: { postedAt: new Date(now.getTime() - 30 * 86_400_000) } });
    const summary = await buildSocialSummary(testPrisma, { storeId: f.store.id, days: 7, now });
    expect(summary.skipBaselines.INSTAGRAM).toEqual({ median: 62, count: 7 });
    const byId = Object.fromEntries(summary.posts.map((item) => [item.caption?.replace("Reel ", ""), item]));
    expect(byId.viejo).toBeUndefined();
    expect(byId.alto).toMatchObject({ skipRate: 73, retentionWarning: true, retentionReasons: ["skip"], skipMedian: 62 });
    for (const id of ["a", "b", "c", "d", "e"]) expect(byId[id]).toMatchObject({ retentionWarning: false });
    expect(JSON.stringify(summary)).not.toMatch(/"raw"/);
  });
});
