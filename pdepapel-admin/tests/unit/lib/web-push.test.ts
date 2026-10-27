import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El envío de avisos push (lib/web-push.ts) con la base y `web-push`
 * simulados: vencidas (404/410) se borran, otros errores suman un fallo, un
 * envío bueno marca `lastSuccessAt`, y nada lanza hacia quien llama.
 */
const db = vi.hoisted(() => ({
  subscriptions: [] as { id: string; endpoint: string; p256dh: string; auth: string }[],
  updates: [] as { where: unknown; data: Record<string, unknown> }[],
  deletes: [] as unknown[],
  findManyError: null as Error | null,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    webPushSubscription: {
      findMany: vi.fn(async () => {
        if (db.findManyError) throw db.findManyError;
        return db.subscriptions;
      }),
      updateMany: vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
        db.updates.push(args);
        return { count: 1 };
      }),
      deleteMany: vi.fn(async (args: { where: unknown }) => {
        db.deletes.push(args.where);
        return { count: 1 };
      }),
      count: vi.fn(async () => db.subscriptions.length),
    },
  },
}));
const webpush = vi.hoisted(() => ({ calls: [] as unknown[][], failWith: null as unknown }));
vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn(async (...args: unknown[]) => {
      webpush.calls.push(args);
      if (webpush.failWith) throw webpush.failWith;
      return { statusCode: 201 };
    }),
  },
}));

import { describePushDevice, getWebPushConfig, hashPushEndpoint, sendWebPushToStore, type WebPushConfig } from "@/lib/web-push";

const config: WebPushConfig = { publicKey: "BPublicKeyTest", privateKey: "privateKeyTest", subject: "mailto:avisos@ejemplo.test" };
const payload = { title: "P de Papel", body: "Una clienta lleva 31 min esperando", url: "/store-1/conversaciones?esperando=1", tag: "clientas-esperando-store-1" };
const sub = (id: string) => ({ id, endpoint: `https://push.example.test/${id}`, p256dh: "p256", auth: "auth" });
const httpError = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

beforeEach(() => {
  db.subscriptions = [];
  db.updates.length = 0;
  db.deletes.length = 0;
  db.findManyError = null;
  webpush.calls.length = 0;
  webpush.failWith = null;
});

describe("getWebPushConfig", () => {
  it("sin alguna de las tres variables, no configurado", () => {
    expect(getWebPushConfig({ publicKey: "a", privateKey: "b" })).toBeNull();
    expect(getWebPushConfig({ publicKey: "a", subject: "mailto:x@y.test" })).toBeNull();
    expect(getWebPushConfig({ privateKey: "b", subject: "mailto:x@y.test" })).toBeNull();
    expect(getWebPushConfig({ publicKey: " ", privateKey: "b", subject: "mailto:x@y.test" })).toBeNull();
  });

  it("el remitente tiene que ser mailto: o https://", () => {
    expect(getWebPushConfig({ publicKey: "a", privateKey: "b", subject: "avisos@ejemplo.test" })).toBeNull();
    expect(getWebPushConfig({ publicKey: "a", privateKey: "b", subject: "https://admin.ejemplo.test" })).toEqual({ publicKey: "a", privateKey: "b", subject: "https://admin.ejemplo.test" });
  });

  it("en las pruebas las llaves no existen: el aviso queda «no configurado»", () => {
    expect(getWebPushConfig()).toBeNull();
  });
});

describe("hashPushEndpoint y describePushDevice", () => {
  it("sha256 en hexadecimal, 64 caracteres, estable", () => {
    expect(hashPushEndpoint("https://push.example.test/a")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPushEndpoint("https://push.example.test/a")).toBe(hashPushEndpoint("https://push.example.test/a"));
    expect(hashPushEndpoint("https://push.example.test/a")).not.toBe(hashPushEndpoint("https://push.example.test/b"));
  });

  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1", "Safari en iPhone"],
    ["Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36", "Chrome en Android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", "Chrome en Mac"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0", "Edge en Windows"],
    [null, null],
  ])("%s → %s", (ua, label) => {
    expect(describePushDevice(ua)).toBe(label);
  });
});

describe("sendWebPushToStore", () => {
  it("sin configuración no lee la base ni manda nada", async () => {
    db.subscriptions = [sub("a")];
    const result = await sendWebPushToStore("store-1", payload, { config: null });
    expect(result).toEqual({ configured: false, devices: 0, delivered: 0, removed: 0, failed: 0 });
    expect(webpush.calls).toHaveLength(0);
  });

  it("manda con VAPID, TTL y tiempo de espera corto, y marca el éxito", async () => {
    db.subscriptions = [sub("a")];
    const now = new Date("2026-10-27T20:00:00Z");
    const result = await sendWebPushToStore("store-1", payload, { config, now });
    expect(result).toMatchObject({ configured: true, devices: 1, delivered: 1, failed: 0, removed: 0 });
    const [subscription, body, options] = webpush.calls[0] as [Record<string, unknown>, string, Record<string, unknown>];
    expect(subscription).toEqual({ endpoint: "https://push.example.test/a", keys: { p256dh: "p256", auth: "auth" } });
    expect(JSON.parse(body)).toEqual(payload);
    expect(options).toMatchObject({ TTL: 600, timeout: 5000, urgency: "high", vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey } });
    expect(db.updates).toEqual([{ where: { id: "a" }, data: { lastSuccessAt: now, failureCount: 0 } }]);
  });

  it.each([404, 410])("un %s borra la suscripción vencida", async (status) => {
    db.subscriptions = [sub("a")];
    webpush.failWith = httpError(status);
    const result = await sendWebPushToStore("store-1", payload, { config });
    expect(result).toMatchObject({ delivered: 0, removed: 1, failed: 0 });
    expect(db.deletes).toEqual([{ id: "a" }]);
    expect(db.updates).toEqual([]);
  });

  it("otro error (500, tiempo agotado) suma un fallo y no borra", async () => {
    db.subscriptions = [sub("a")];
    webpush.failWith = httpError(500);
    expect(await sendWebPushToStore("store-1", payload, { config })).toMatchObject({ delivered: 0, removed: 0, failed: 1 });
    webpush.failWith = new Error("timeout");
    expect(await sendWebPushToStore("store-1", payload, { config })).toMatchObject({ failed: 1 });
    expect(db.deletes).toEqual([]);
    expect(db.updates.map((update) => update.data)).toEqual([{ failureCount: { increment: 1 } }, { failureCount: { increment: 1 } }]);
  });

  it("varios aparatos: cada uno con su resultado", async () => {
    db.subscriptions = [sub("ok"), sub("gone"), sub("down")];
    const send = vi.fn(async (subscription: { id: string }) => {
      if (subscription.id === "gone") throw httpError(410);
      if (subscription.id === "down") throw httpError(503);
    });
    const result = await sendWebPushToStore("store-1", payload, { config, send });
    expect(result).toMatchObject({ devices: 3, delivered: 1, removed: 1, failed: 1 });
  });

  it("si la base falla, no lanza hacia quien llama", async () => {
    db.findManyError = new Error("db down");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(sendWebPushToStore("store-1", payload, { config })).resolves.toMatchObject({ configured: true, delivered: 0 });
    error.mockRestore();
  });
});
