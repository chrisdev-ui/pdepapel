import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ send: vi.fn(async (..._args: unknown[]) => ({ data: { id: "email" }, error: null })) }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mail.send } } }));

import { SocialApiError } from "@/lib/social/errors";
import { getSocialReconnectNeeds, markSocialNeedsReconnect } from "@/lib/social/reconnect";
import { runSocialSync, type SocialAdapter } from "@/lib/social/sync";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Reconectar» avisa una sola vez por transición: la corrida que pasa la
 * cuenta a NEEDS_RECONNECT manda el correo; las siguientes, mientras siga
 * ahí, no. Al reconectar (OK) la próxima caída vuelve a avisar.
 */
let f: InventoryFixture | undefined;

const rejecting: SocialAdapter = {
  platform: "INSTAGRAM",
  fetchAccount: async () => {
    throw new SocialApiError("INSTAGRAM", "auth", "meta_190", 400);
  },
  listPosts: async () => ({ posts: [], next: null }),
};
const subjects = () => mail.send.mock.calls.map((call) => (call[0] as { subject: string }).subject);

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) {
    await testPrisma.socialAccount.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
  mail.send.mockClear();
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("aviso de reconexión de redes", () => {
  it("un correo por transición, ninguno mientras sigue en «Reconectar», otro tras reconectar y volver a caer", async () => {
    f = await createInventoryFixture();
    const account = await testPrisma.socialAccount.create({ data: { storeId: f.store.id, platform: "INSTAGRAM", externalId: "ig1", tokenRef: "env:META_IG_PAGE_TOKEN" } });
    expect(await getSocialReconnectNeeds(f.store.id)).toEqual([]);

    expect(await runSocialSync({ accountId: account.id, adapter: rejecting })).toEqual({ status: "reconnect", reason: "meta_190" });
    expect(subjects()).toEqual(["⚠️ Hay que reconectar Instagram"]);
    expect((mail.send.mock.calls[0][0] as { to: string[] }).to).toEqual(["avisos@prueba.test"]);
    expect(await getSocialReconnectNeeds(f.store.id)).toEqual(["INSTAGRAM"]);

    // Sigue rechazada: otra corrida y otro motivo, sin correo nuevo.
    await runSocialSync({ accountId: account.id, adapter: rejecting });
    expect(await markSocialNeedsReconnect(account.id, "account_changed")).toBe(false);
    expect(subjects()).toHaveLength(1);
    expect(await testPrisma.socialAccount.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({ status: "NEEDS_RECONNECT", statusReason: "account_changed" });

    // La dueña reconecta (la conexión deja la cuenta en OK) y luego vuelve a caer.
    await testPrisma.socialAccount.update({ where: { id: account.id }, data: { status: "OK", statusReason: null } });
    expect(await getSocialReconnectNeeds(f.store.id)).toEqual([]);
    await runSocialSync({ accountId: account.id, adapter: rejecting });
    expect(subjects()).toHaveLength(2);
  });

  it("dos corridas a la vez sobre la misma transición mandan un solo correo", async () => {
    f = await createInventoryFixture();
    const account = await testPrisma.socialAccount.create({ data: { storeId: f.store.id, platform: "TIKTOK", externalId: "open1" } });
    const results = await Promise.all([markSocialNeedsReconnect(account.id, "tiktok_invalid_grant"), markSocialNeedsReconnect(account.id, "tiktok_invalid_grant")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(subjects()).toEqual(["⚠️ Hay que reconectar TikTok"]);
  });
});
