import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ send: vi.fn(async (..._args: unknown[]): Promise<{ data: { id: string } | null; error: unknown }> => ({ data: { id: "email" }, error: null })) }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mail.send } } }));

import { evaluateEarlyAlerts, getRecentEarlyAlerts, isEarlyAlertSwitchOn, setEarlyAlertSwitch } from "@/lib/social/early-alert";
import { earlyAlertLine } from "@/lib/social/early-alert-rules";
import { buildSocialSummary } from "@/lib/social/report";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Alerta temprana: cada red se enciende sola al juntar 10 publicaciones con
 * lectura a las 2–6 h (una puede estar encendida y la otra no); el interruptor
 * de la tienda la pausa sin desplegar. Una sola alerta por publicación aunque
 * corran dos pasadas a la vez, como mucho 3 correos por día de Bogotá y el
 * cupo se libera si el correo no sale.
 */
let f: InventoryFixture | undefined;
const HOUR = 3_600_000;
const now = new Date("2026-11-20T18:00:00Z"); // 13:00 en Bogotá

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) {
    await testPrisma.socialEarlyAlert.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.storeSettings.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.socialAccount.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
  mail.send.mockReset();
  mail.send.mockImplementation(async () => ({ data: { id: "email" }, error: null }));
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

/** `history` publicaciones viejas con 100 vistas a las 3 h, y las jóvenes indicadas con sus vistas a las 3 h. */
async function seed(history: number, young: { views: number; ageHours?: number }[], platform: "INSTAGRAM" | "TIKTOK" = "INSTAGRAM") {
  f ??= await createInventoryFixture();
  const account = await testPrisma.socialAccount.create({ data: { storeId: f.store.id, platform, externalId: `${platform}-1` } });
  const make = async (externalId: string, ageHours: number, views: number) => {
    const post = await testPrisma.socialPost.create({ data: { socialAccountId: account.id, platform, externalId: `${platform}-${externalId}`, caption: `Reel ${externalId}`, postedAt: new Date(now.getTime() - ageHours * HOUR) } });
    await testPrisma.socialMetricSnapshot.create({ data: { socialPostId: post.id, capturedAt: new Date(post.postedAt.getTime() + 3 * HOUR), hoursSincePost: 3, views } });
    return post;
  };
  for (let index = 0; index < history; index += 1) await make(`old${index}`, 48 + index * 24, 100);
  const posts = [];
  for (let index = 0; index < young.length; index += 1) posts.push(await make(`new${index}`, young[index].ageHours ?? 3.5, young[index].views));
  return { account, posts };
}

describe("alerta temprana de redes", () => {
  it("se enciende sola por red: Instagram con 10 de historia avisa, TikTok con 4 espera; la línea lo dice por red", async () => {
    const instagram = await seed(10, [{ views: 160 }, { views: 40 }, { views: 120 }]);
    const tiktok = await seed(4, [{ views: 900 }], "TIKTOK");
    expect(await evaluateEarlyAlerts(tiktok.account.id, { now })).toEqual({ status: "waiting", created: 0, emailed: 0 });
    expect(await evaluateEarlyAlerts(instagram.account.id, { now })).toEqual({ status: "done", created: 2, emailed: 2 });

    const alerts = await getRecentEarlyAlerts(f!.store.id);
    expect(alerts.map((alert) => [alert.kind, alert.ratio, alert.caption])).toEqual(
      expect.arrayContaining([
        ["DESPEGANDO", 1.6, "Reel new0"],
        ["LENTA", 0.4, "Reel new1"],
      ]),
    );
    const subjects = mail.send.mock.calls.map((call) => (call[0] as { subject: string }).subject).sort();
    expect(subjects).toEqual(["🐢 Va lenta en Instagram", "🚀 Va despegando en Instagram"]);
    const text = (mail.send.mock.calls[0][0] as { text: string }).text;
    expect(text).toMatch(/A las 3 h lleva .+× lo normal para esa edad\./);
    expect(text).not.toMatch(/token|tokenRef/i);

    const summary = await buildSocialSummary(testPrisma, { storeId: f!.store.id, days: 90, now });
    expect(summary.earlyAlert).toEqual({ switchOn: true, needed: 10, networks: { INSTAGRAM: { history: 13, on: true }, TIKTOK: { history: 5, on: false } } });
    expect(earlyAlertLine(summary.earlyAlert)).toBe("Alerta temprana — Instagram: encendida · TikTok: apagada, 5 de 10. Cada red se enciende sola al juntar 10 publicaciones con lectura a las 2–6 h.");
  });

  it("una publicación promocionada (confirmada) no cuenta en la historia: con 10 y una promocionada, espera", async () => {
    // 9 viejas + 1 nueva = 10 con lectura a las 2–6 h; sin la promocionada quedan 9.
    const { account } = await seed(9, [{ views: 160 }]);
    expect((await buildSocialSummary(testPrisma, { storeId: f!.store.id, days: 90, now })).earlyAlert.networks.INSTAGRAM).toEqual({ history: 10, on: true });
    const promoted = await testPrisma.socialPost.findFirstOrThrow({ where: { socialAccountId: account.id, externalId: "INSTAGRAM-old0" } });
    await testPrisma.socialPost.update({ where: { id: promoted.id }, data: { promotion: "PROMOTED", promotionSource: "MANUAL", promotionSetAt: now } });
    expect(await evaluateEarlyAlerts(account.id, { now })).toEqual({ status: "waiting", created: 0, emailed: 0 });
    const summary = await buildSocialSummary(testPrisma, { storeId: f!.store.id, days: 90, now });
    expect(summary.earlyAlert.networks.INSTAGRAM).toEqual({ history: 9, on: false });
  });

  it("el interruptor de la tienda la pausa sin desplegar y la reanuda; sin fila cuenta como encendido", async () => {
    const { account } = await seed(12, [{ views: 400 }]);
    expect(await isEarlyAlertSwitchOn(f!.store.id)).toBe(true);
    await setEarlyAlertSwitch(f!.store.id, false);
    expect(await evaluateEarlyAlerts(account.id, { now })).toEqual({ status: "off", created: 0, emailed: 0 });
    expect(await testPrisma.socialEarlyAlert.count({ where: { storeId: f!.store.id } })).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
    const paused = await buildSocialSummary(testPrisma, { storeId: f!.store.id, days: 90, now });
    expect(paused.earlyAlert).toMatchObject({ switchOn: false, networks: { INSTAGRAM: { on: false } } });
    expect(earlyAlertLine(paused.earlyAlert)).toBe("Alerta temprana: pausada desde el panel. No avisa en ninguna red hasta reanudarla.");

    await setEarlyAlertSwitch(f!.store.id, true);
    expect(await evaluateEarlyAlerts(account.id, { now })).toMatchObject({ status: "done", created: 1 });
  });

  it("una sola alerta por publicación aunque dos pasadas corran a la vez; una publicación de más de 7 h no avisa", async () => {
    const { account, posts } = await seed(10, [{ views: 300 }, { views: 300, ageHours: 9 }]);
    const runs = await Promise.all([evaluateEarlyAlerts(account.id, { now }), evaluateEarlyAlerts(account.id, { now })]);
    expect(runs.reduce((sum, run) => sum + run.created, 0)).toBe(1);
    expect(await testPrisma.socialEarlyAlert.findMany({ where: { storeId: f!.store.id }, select: { socialPostId: true } })).toEqual([{ socialPostId: posts[0].id }]);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(await evaluateEarlyAlerts(account.id, { now })).toMatchObject({ created: 0 });
  });

  it("como mucho 3 correos por día de Bogotá; si el correo no sale, el cupo se libera", async () => {
    const { account } = await seed(10, [{ views: 300 }, { views: 300 }, { views: 300 }, { views: 300 }]);
    mail.send.mockImplementationOnce(async () => ({ data: null, error: { name: "validation_error", message: "rechazado" } }));
    const run = await evaluateEarlyAlerts(account.id, { now });
    expect(run.created).toBe(4);
    const emailed = await testPrisma.socialEarlyAlert.count({ where: { storeId: f!.store.id, emailedAt: { not: null } } });
    // El primero falló y liberó su cupo: salen 3 de los otros, el último queda solo en Inicio.
    expect(emailed).toBe(3);
    expect(run.emailed).toBe(3);
    expect(await getRecentEarlyAlerts(f!.store.id)).toHaveLength(4);
  });
});
