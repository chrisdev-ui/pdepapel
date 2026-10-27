import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Clientas esperando» contra MySQL (lib/whatsapp/waiting-alert.ts, la
 * revisión `alert` de wait-assist.ts y POST/DELETE /api/[storeId]/web-push):
 * un aviso por espera, la pausa de Paula incluida, horas de silencio, la
 * cuenta de Inicio y del menú con el mismo umbral, y quién puede registrar un
 * aparato. `web-push` y la cola se simulan y se cuentan. Datos sintéticos.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: async () => null } }),
}));
const sim = vi.hoisted(() => ({ pushes: [] as { endpoint: string; body: Record<string, unknown> }[], queued: [] as { kind: string; dedup: string; delay: number }[] }));
vi.mock("web-push", () => ({
  default: {
    sendNotification: async (subscription: { endpoint: string }, body: string) => {
      sim.pushes.push({ endpoint: subscription.endpoint, body: JSON.parse(body) });
      return { statusCode: 201 };
    },
  },
}));
vi.mock("@/lib/whatsapp/queue", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/queue");
  return {
    ...actual,
    enqueueWhatsAppWaitCheck: async (check: { kind: string }, _key: string | null, delay: number, dedup: string) => {
      sim.queued.push({ kind: check.kind, dedup, delay });
      return true;
    },
  };
});

const MIN = 60 * 1000;
/** 2026-10-14 15:00 Bogotá. */
const DAY = new Date("2026-10-14T20:00:00Z");
const bogota = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00-05:00`);
const ago = (now: Date, minutes: number) => new Date(now.getTime() - minutes * MIN);
// Llaves ficticias con la forma de una VAPID real (pública 87 caracteres con «B», privada 43): la configuración valida la forma.
const VAPID = { NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY: `B${"A".repeat(86)}`, WEB_PUSH_VAPID_PRIVATE_KEY: "A".repeat(43), WEB_PUSH_VAPID_SUBJECT: "mailto:avisos@ejemplo.test" };

let fixture: InventoryFixture;
let store = "";
let owner = "";
let phoneSeq = 0;

async function conversation(messages: { sentBy: "CUSTOMER" | "OWNER" | "BOT"; at: Date; body?: string }[], data: { status?: "OPEN" | "NEEDS_OWNER"; needsOwnerReason?: string | null } = {}) {
  const row = await testPrisma.conversation.create({
    data: { storeId: store, phone: `31000000${String(++phoneSeq).padStart(2, "0")}`, status: data.status ?? "OPEN", needsOwnerReason: data.needsOwnerReason ?? null },
  });
  const ids: string[] = [];
  for (const message of messages) {
    const created = await testPrisma.conversationMessage.create({
      data: {
        conversationId: row.id,
        direction: message.sentBy === "CUSTOMER" ? "INBOUND" : "OUTBOUND",
        sentBy: message.sentBy,
        body: message.body ?? (message.sentBy === "CUSTOMER" ? "¿tienen agendas 2027?" : "ya te ayudo"),
        externalId: `wamid.${randomUUID()}`,
        status: message.sentBy === "CUSTOMER" ? "RECEIVED" : "SENT",
        createdAt: message.at,
      },
    });
    ids.push(created.id);
  }
  await testPrisma.conversation.update({
    where: { id: row.id },
    data: {
      lastInboundAt: messages.filter((m) => m.sentBy === "CUSTOMER").at(-1)?.at ?? null,
      lastOutboundAt: messages.filter((m) => m.sentBy !== "CUSTOMER").at(-1)?.at ?? null,
      lastOwnerAt: messages.filter((m) => m.sentBy === "OWNER").at(-1)?.at ?? null,
    },
  });
  return { id: row.id, ids };
}

async function device(name: string = randomUUID()) {
  const { hashPushEndpoint } = await import("@/lib/web-push");
  const endpoint = `https://push.ejemplo.test/${name}`;
  await testPrisma.webPushSubscription.create({ data: { storeId: store, userId: owner, endpointHash: hashPushEndpoint(endpoint), endpoint, p256dh: "p256dh", auth: "auth" } });
  return endpoint;
}

const alerts = (conversationId: string) => testPrisma.whatsAppWaitDecision.findMany({ where: { conversationId, kind: "alert" } });

async function clean() {
  const ids = (await testPrisma.conversation.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: ids } } });
  await testPrisma.whatsAppWaitDecision.deleteMany({ where: { storeId: store } });
  await testPrisma.conversation.deleteMany({ where: { storeId: store } });
  await testPrisma.webPushSubscription.deleteMany({ where: { storeId: store } });
  await testPrisma.jobRun.deleteMany({ where: { id: { contains: store } } });
}

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  store = fixture.store.id;
  owner = fixture.store.userId;
  Object.assign(process.env, VAPID);
});

beforeEach(async () => {
  sim.pushes.length = 0;
  sim.queued.length = 0;
  session.userId = owner;
  session.claims = {};
  await clean();
  await testPrisma.storeSettings.upsert({ where: { storeId: store }, create: { storeId: store, waitingAlertMinutes: 30 }, update: { waitingAlertMinutes: 30 } });
});

afterAll(async () => {
  for (const name of Object.keys(VAPID)) delete process.env[name];
  await clean();
  await testPrisma.storeSettings.deleteMany({ where: { storeId: store } });
  await deleteInventoryFixture(fixture);
  await testPrisma.$disconnect();
});

describe("aviso push, una vez por espera", () => {
  it("a los 30 min avisa una sola vez, aunque Paula tenga el bot en pausa (NEEDS_OWNER por su ventana de 24 h)", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    const endpoint = await device();
    const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 45) }], { status: "NEEDS_OWNER", needsOwnerReason: "owner_window" });
    const check = { conversationId: chat.id, messageId: chat.ids[1], kind: "alert" as const };

    const results = await Promise.all([runWaitCheck(check, DAY), runWaitCheck(check, DAY)]);
    expect(results.map((r) => r.decision).sort()).toEqual(["claimed_elsewhere", "send"]);
    expect(sim.pushes).toEqual([{ endpoint, body: { title: "P de Papel", body: "Una clienta lleva 45 min esperando", url: `/${store}/conversaciones?esperando=1`, tag: `clientas-esperando-${store}` } }]);
    expect(await alerts(chat.id)).toEqual([expect.objectContaining({ kind: "alert", mode: "PUSH", decision: "send", reason: null, outcome: "sent", turnMessageId: chat.ids[1] })]);

    await expect(runWaitCheck(check, new Date(DAY.getTime() + 60 * MIN))).resolves.toMatchObject({ decision: "claimed_elsewhere" });
    expect(sim.pushes).toHaveLength(1);
    const stored = await testPrisma.webPushSubscription.findFirstOrThrow({ where: { storeId: store } });
    expect(stored.lastSuccessAt).not.toBeNull();
  });

  it("antes del umbral no anota nada y se reprograma a la hora nueva (Paula lo subió después)", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    await device();
    await testPrisma.storeSettings.update({ where: { storeId: store }, data: { waitingAlertMinutes: 60 } });
    const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 35) }]);
    await expect(runWaitCheck({ conversationId: chat.id, messageId: chat.ids[1], kind: "alert" }, DAY)).resolves.toMatchObject({ decision: "skip", reason: "too_early" });
    expect(await alerts(chat.id)).toEqual([]);
    const dueAt = ago(DAY, 35).getTime() + 60 * MIN;
    expect(sim.queued).toEqual([{ kind: "alert", dedup: `wait-alert-${chat.ids[1]}-${dueAt}`, delay: 25 * 60 }]);
    expect(sim.pushes).toEqual([]);
  });

  it("en horas de silencio anota quiet_hours, no manda, y a las 7 a. m. tampoco", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    await device();
    const night = bogota("22:00");
    const chat = await conversation([{ sentBy: "OWNER", at: ago(night, 300) }, { sentBy: "CUSTOMER", at: ago(night, 40) }]);
    const check = { conversationId: chat.id, messageId: chat.ids[1], kind: "alert" as const };
    await expect(runWaitCheck(check, night)).resolves.toMatchObject({ decision: "skip", reason: "quiet_hours" });
    expect(await alerts(chat.id)).toEqual([expect.objectContaining({ decision: "skip", reason: "quiet_hours", outcome: null })]);
    await expect(runWaitCheck(check, new Date("2026-10-15T07:30:00-05:00"))).resolves.toMatchObject({ decision: "claimed_elsewhere" });
    expect(sim.pushes).toEqual([]);
  });

  it("a las 21:59 todavía avisa", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    await device();
    const late = bogota("21:59");
    const chat = await conversation([{ sentBy: "OWNER", at: ago(late, 300) }, { sentBy: "CUSTOMER", at: ago(late, 31) }]);
    await expect(runWaitCheck({ conversationId: chat.id, messageId: chat.ids[1], kind: "alert" }, late)).resolves.toMatchObject({ decision: "send" });
    expect(sim.pushes).toHaveLength(1);
  });

  it("sin aparatos registrados no anota ni manda; una espera ya contestada sale sin escribir", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    const silent = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 45) }]);
    await expect(runWaitCheck({ conversationId: silent.id, messageId: silent.ids[1], kind: "alert" }, DAY)).resolves.toMatchObject({ decision: "no_devices" });
    expect(await alerts(silent.id)).toEqual([]);

    await device();
    const answered = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 45) }, { sentBy: "OWNER", at: ago(DAY, 5) }]);
    await expect(runWaitCheck({ conversationId: answered.id, messageId: answered.ids[1], kind: "alert" }, DAY)).resolves.toMatchObject({ decision: "no_wait" });
    expect(await alerts(answered.id)).toEqual([]);
    expect(sim.pushes).toEqual([]);
  });

  it("un aparato vencido (410) se borra y la decisión queda send_failed", async () => {
    const { runAlertCheck } = await import("@/lib/whatsapp/waiting-alert");
    await device();
    const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 45) }]);
    const { sendWebPushToStore } = await import("@/lib/web-push");
    const gone = async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    };
    const result = await runAlertCheck({ id: chat.id, storeId: store }, chat.ids[1], DAY, {
      push: (storeId, payload) => sendWebPushToStore(storeId, payload, { config: { publicKey: "a", privateKey: "b", subject: "mailto:x@ejemplo.test" }, send: gone }),
    });
    expect(result).toEqual({ decision: "send", outcome: "send_failed" });
    expect(await testPrisma.webPushSubscription.count({ where: { storeId: store } })).toBe(0);
  });
});

describe("programación desde la espera", () => {
  it("con un aparato, la espera programa su revisión de aviso al umbral; sin aparatos, no se publica", async () => {
    const { scheduleWaitChecks } = await import("@/lib/whatsapp/wait-assist");
    const now = Date.now();
    const first = await conversation([{ sentBy: "OWNER", at: new Date(now - 120 * MIN) }, { sentBy: "CUSTOMER", at: new Date(now - 1 * MIN) }]);
    await scheduleWaitChecks(first.id);
    expect(sim.queued.map((job) => job.kind)).toEqual(["fallback"]);

    sim.queued.length = 0;
    await device();
    const second = await conversation([{ sentBy: "OWNER", at: new Date(now - 120 * MIN) }, { sentBy: "CUSTOMER", at: new Date(now - 1 * MIN) }]);
    await scheduleWaitChecks(second.id);
    const alert = sim.queued.find((job) => job.kind === "alert");
    expect(alert).toMatchObject({ dedup: `wait-alert-${second.ids[1]}` });
    expect(alert!.delay).toBeGreaterThan(28 * 60);
    expect(alert!.delay).toBeLessThanOrEqual(29 * 60 + 5);
  });
});

describe("tarjeta de Inicio y número del menú", () => {
  it("cuentan lo mismo, con el umbral de la tienda, pausa incluida, sin las contestadas, atendidas ni «gracias»", async () => {
    const { getWaitingAlertSummary, loadWaitingAlertSummary } = await import("@/lib/whatsapp/waiting-alert");
    const now = new Date();
    const old = await conversation([{ sentBy: "OWNER", at: ago(now, 300) }, { sentBy: "CUSTOMER", at: ago(now, 90) }]);
    const paused = await conversation([{ sentBy: "OWNER", at: ago(now, 300) }, { sentBy: "CUSTOMER", at: ago(now, 40) }], { status: "NEEDS_OWNER", needsOwnerReason: "owner_window" });
    const fresh = await conversation([{ sentBy: "OWNER", at: ago(now, 300) }, { sentBy: "CUSTOMER", at: ago(now, 10) }]);
    await conversation([{ sentBy: "CUSTOMER", at: ago(now, 300) }, { sentBy: "OWNER", at: ago(now, 120) }]);
    await conversation([{ sentBy: "OWNER", at: ago(now, 300) }, { sentBy: "CUSTOMER", at: ago(now, 100), body: "gracias" }]);
    const attended = await conversation([{ sentBy: "OWNER", at: ago(now, 300) }, { sentBy: "CUSTOMER", at: ago(now, 80) }]);
    await testPrisma.conversation.update({ where: { id: attended.id }, data: { waitAttendedAt: ago(now, 60), waitAttendedBy: owner } });

    const summary = await loadWaitingAlertSummary(store, now);
    expect(summary).toMatchObject({ minutes: 30, count: 2 });
    expect(summary.items.map((item) => item.conversationId)).toEqual([old.id, paused.id]);
    expect(Object.keys(summary.items[0]).sort()).toEqual(["conversationId", "since"]);

    await testPrisma.storeSettings.update({ where: { storeId: store }, data: { waitingAlertMinutes: 5 } });
    const lower = await loadWaitingAlertSummary(store, now);
    expect(lower.items.map((item) => item.conversationId)).toEqual([old.id, paused.id, fresh.id]);

    // El menú lee la misma función (compartida unos segundos entre el menú y la tarjeta).
    const shared = await getWaitingAlertSummary(store);
    expect(shared.count).toBe(3);
  });

  it("el barrido avisa las esperas que no alcanzó su revisión, una vez", async () => {
    const { alertWaitingFromSweep } = await import("@/lib/whatsapp/waiting-alert");
    await device();
    const now = DAY;
    const chat = await conversation([{ sentBy: "OWNER", at: ago(now, 300) }, { sentBy: "CUSTOMER", at: ago(now, 50) }]);
    await expect(alertWaitingFromSweep(now)).resolves.toBeGreaterThanOrEqual(1);
    expect(sim.pushes).toHaveLength(1);
    expect(await alerts(chat.id)).toEqual([expect.objectContaining({ decision: "send", outcome: "sent" })]);
    await testPrisma.jobRun.deleteMany({ where: { id: { contains: store } } });
    await alertWaitingFromSweep(new Date(now.getTime() + 10 * MIN));
    expect(sim.pushes).toHaveLength(1);
  });
});

describe("POST/GET/DELETE /api/[storeId]/web-push", () => {
  const subscription = (name: string) => ({ endpoint: `https://push.ejemplo.test/${name}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA", auth: "tBHItJI5svbpez7KI4CCXg" } });
  const call = async (method: "GET" | "POST" | "DELETE", body?: unknown) => {
    const route = await import("@/app/api/[storeId]/web-push/route");
    const request = new Request(`http://admin.test/api/${store}/web-push`, {
      method,
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile/15E148 Safari/604.1" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return route[method](request, { params: { storeId: store } });
  };

  it("la dueña registra el aparato (sin duplicar) y lo quita", async () => {
    const status = await call("GET");
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ configured: true, reason: null, publicKey: VAPID.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY, devices: 0, max: 10 });

    expect((await call("POST", subscription("a"))).status).toBe(200);
    expect((await call("POST", subscription("a"))).status).toBe(200);
    const rows = await testPrisma.webPushSubscription.findMany({ where: { storeId: store } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: owner, deviceLabel: "Safari en iPhone", endpoint: subscription("a").endpoint });
    expect(rows[0].endpointHash).toMatch(/^[0-9a-f]{64}$/);

    const removed = await call("DELETE", { endpoint: subscription("a").endpoint });
    expect(await removed.json()).toEqual({ removed: 1 });
    expect(await testPrisma.webPushSubscription.count({ where: { storeId: store } })).toBe(0);
  });

  it("sin sesión 401; otra cuenta 403; solo lectura 403 (también al leer el estado)", async () => {
    session.userId = null;
    expect((await call("POST", subscription("b"))).status).toBe(401);
    session.userId = `otra-${randomUUID()}`;
    expect((await call("POST", subscription("b"))).status).toBe(403);
    expect((await call("DELETE", { endpoint: subscription("b").endpoint })).status).toBe(403);
    session.claims = { metadata: { role: "viewer", allowedStoreIds: [store] } };
    expect((await call("POST", subscription("b"))).status).toBe(403);
    expect((await call("GET")).status).toBe(403);
    expect(await testPrisma.webPushSubscription.count({ where: { storeId: store } })).toBe(0);
  });

  it("rechaza una suscripción mal formada y pone tope de 10 aparatos por tienda", async () => {
    expect((await call("POST", { endpoint: "http://inseguro.test/x", keys: { p256dh: "a", auth: "b" } })).status).toBe(400);
    expect((await call("POST", { endpoint: "https://push.ejemplo.test/x" })).status).toBe(400);
    for (let index = 0; index < 10; index += 1) await device(`tope-${index}`);
    const refused = await call("POST", subscription("once"));
    expect(refused.status).toBe(409);
    // Volver a guardar uno que ya está no cuenta contra el tope.
    expect((await call("POST", { endpoint: "https://push.ejemplo.test/tope-0", keys: subscription("x").keys })).status).toBe(200);
  });

  it("sin las llaves VAPID dice «no configurado» y no guarda nada", async () => {
    const saved = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    try {
      expect(await (await call("GET")).json()).toMatchObject({ configured: false, reason: "missing_private", publicKey: null });
      expect((await call("POST", subscription("c"))).status).toBe(400);
    } finally {
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY = saved;
    }
  });
});
