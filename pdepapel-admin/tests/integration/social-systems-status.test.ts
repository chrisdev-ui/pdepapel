import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildSystemsStatus, socialSystemsSkip } from "@/lib/job-runs";
import { SocialApiError } from "@/lib/social/errors";
import { INSTAGRAM_POST_METRICS, pickMetrics } from "@/lib/social/metrics";
import { processSocialSyncMessage } from "@/lib/social/runner";
import type { SocialAdapter } from "@/lib/social/sync";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Sistemas» con una fila por red: si Instagram falla y TikTok sincroniza
 * después, la fila de Instagram sigue mostrando su fallo.
 */
let f: InventoryFixture | undefined;

const ok = (platform: "INSTAGRAM" | "TIKTOK", externalId: string): SocialAdapter => ({
  platform,
  fetchAccount: async () => ({ externalId, username: "pdepapel", metrics: { followers_count: 10 } }),
  listPosts: async () => ({ posts: [], next: null }),
  fetchPostMetrics: async () => pickMetrics({ views: 1 }, INSTAGRAM_POST_METRICS),
});
const failing: SocialAdapter = {
  platform: "INSTAGRAM",
  fetchAccount: async () => {
    throw new SocialApiError("INSTAGRAM", "http", "meta_10", 400);
  },
  listPosts: async () => ({ posts: [], next: null }),
};

async function statusRows(storeId: string) {
  const runs = await testPrisma.jobRun.findMany({ where: { storeId }, select: { name: true, storeId: true, ranAt: true, ok: true, detail: true } });
  return buildSystemsStatus(runs, storeId, new Date(), await socialSystemsSkip(storeId));
}

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) {
    await testPrisma.jobRun.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.socialAccount.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("«Sistemas» por red", () => {
  it("Instagram falla y TikTok sincroniza después: la falla de Instagram sigue a la vista", async () => {
    f = await createInventoryFixture();
    const instagram = await testPrisma.socialAccount.create({ data: { storeId: f.store.id, platform: "INSTAGRAM", externalId: "ig1", tokenRef: "env:META_IG_PAGE_TOKEN" } });
    const tiktok = await testPrisma.socialAccount.create({ data: { storeId: f.store.id, platform: "TIKTOK", externalId: "open1" } });

    expect(await processSocialSyncMessage({ accountId: instagram.id }, { adapter: failing })).toEqual({ status: "failed", reason: "meta_10" });
    expect(await processSocialSyncMessage({ accountId: tiktok.id }, { adapter: ok("TIKTOK", "open1") })).toMatchObject({ status: "done" });

    const rows = await statusRows(f.store.id);
    expect(rows.find((row) => row.name === "social-sync-instagram")).toMatchObject({ label: "Métricas de Instagram", ok: false, attention: true, detail: "Falló (meta_10)" });
    expect(rows.find((row) => row.name === "social-sync-tiktok")).toMatchObject({ label: "Métricas de TikTok", ok: true, attention: false, detail: "0 publicaciones revisadas, 0 mediciones" });

    // Instagram se recupera en la corrida siguiente: su fila vuelve a verde, la de TikTok no cambia.
    await processSocialSyncMessage({ accountId: instagram.id }, { adapter: ok("INSTAGRAM", "ig1") });
    const after = await statusRows(f.store.id);
    expect(after.find((row) => row.name === "social-sync-instagram")).toMatchObject({ ok: true, attention: false });
    expect(after.find((row) => row.name === "social-sync-tiktok")).toMatchObject({ ok: true });
  });

  it("solo aparecen las redes con cuenta; una sin configurar queda en rojo, no en silencio", async () => {
    f = await createInventoryFixture();
    expect((await statusRows(f.store.id)).filter((row) => row.name.startsWith("social-sync"))).toEqual([]);

    const tiktok = await testPrisma.socialAccount.create({ data: { storeId: f.store.id, platform: "TIKTOK", externalId: "open1" } });
    expect(await processSocialSyncMessage({ accountId: tiktok.id }, { adapter: null })).toEqual({ status: "skipped", reason: "not_configured" });
    const rows = await statusRows(f.store.id);
    expect(rows.some((row) => row.name === "social-sync-instagram")).toBe(false);
    expect(rows.find((row) => row.name === "social-sync-tiktok")).toMatchObject({ ok: false, attention: true, detail: expect.stringContaining("not_configured") });
  });
});
