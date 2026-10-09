import { describe, expect, it, vi } from "vitest";

import {
  countPendingWhatsAppReplays,
  getWhatsAppReplayKey,
  replayStashedWhatsAppWebhook,
  stashFailedWhatsAppWebhook,
  WHATSAPP_REPLAY_PREFIX,
} from "@/lib/whatsapp/webhook-replay";

const QUEUE_ENV = {
  QSTASH_TOKEN: "token",
  QSTASH_CURRENT_SIGNING_KEY: "current",
  QSTASH_NEXT_SIGNING_KEY: "next",
  ADMIN_WEB_URL: "https://admin.example.com",
};

function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    scan: vi.fn(async (_cursor: string | number, options: { match: string }): Promise<[string, string[]]> => [
      "0",
      Array.from(store.keys()).filter((key) => key.startsWith(options.match.replace("*", ""))),
    ]),
  };
}

describe("cola de reintento del webhook de WhatsApp", () => {
  it("la llave sale del eventKey sin exponerlo y es estable", () => {
    const key = getWhatsAppReplayKey("wamid.ABC:delivered:1791575300");
    expect(key.startsWith(WHATSAPP_REPLAY_PREFIX)).toBe(true);
    expect(key).not.toContain("wamid");
    expect(getWhatsAppReplayKey("wamid.ABC:delivered:1791575300")).toBe(key);
  });

  it("guarda el cuerpo verificado 7 días y encola el reintento a los 30 s", async () => {
    const redis = fakeRedis();
    const publish = vi.fn(async () => ({ messageId: "m1" }));
    const result = await stashFailedWhatsAppWebhook(
      { eventKey: "wamid.ABC", body: '{"entry":[]}' },
      { redis, publish, environment: QUEUE_ENV },
    );
    const key = getWhatsAppReplayKey("wamid.ABC");
    expect(result).toEqual({ stashed: true, queued: true });
    expect(redis.set).toHaveBeenCalledWith(key, expect.objectContaining({ body: '{"entry":[]}', eventKey: "wamid.ABC" }), { ex: 7 * 24 * 3600 });
    expect(publish).toHaveBeenCalledWith({
      url: "https://admin.example.com/api/internal/marketplaces/whatsapp/replay",
      body: { key },
      delay: "30s",
      retries: 5,
    });
  });

  it("sin cola configurada lo guarda igual; si Redis falla no lanza", async () => {
    const redis = fakeRedis();
    const publish = vi.fn();
    expect(await stashFailedWhatsAppWebhook({ eventKey: "k", body: "{}" }, { redis, publish, environment: {} })).toEqual({ stashed: true, queued: false });
    expect(publish).not.toHaveBeenCalled();

    redis.set.mockRejectedValueOnce(new Error("redis down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await stashFailedWhatsAppWebhook({ eventKey: "k", body: "{}" }, { redis, publish, environment: QUEUE_ENV })).toEqual({ stashed: false, queued: false });
    expect(JSON.stringify(error.mock.calls)).not.toContain("{}\"");
    error.mockRestore();
  });

  it("el reintento guarda una sola vez y borra la copia; si la base sigue caída, lanza para que QStash reintente", async () => {
    const redis = fakeRedis();
    const key = getWhatsAppReplayKey("wamid.ABC");
    redis.store.set(key, { body: '{"x":1}', eventKey: "wamid.ABC", receivedAt: "2026-10-09T19:48:27.183Z" });

    const failing = vi.fn(async () => {
      throw new Error("Can't reach database server");
    });
    await expect(replayStashedWhatsAppWebhook(key, failing, redis)).rejects.toThrow("Can't reach database server");
    expect(redis.store.has(key)).toBe(true);

    const ingest = vi.fn(async () => ({ stored: true, eventId: "event-1" }));
    await expect(replayStashedWhatsAppWebhook(key, ingest, redis)).resolves.toEqual({ status: "stored", eventId: "event-1" });
    expect(ingest).toHaveBeenCalledWith('{"x":1}');
    expect(redis.store.has(key)).toBe(false);

    await expect(replayStashedWhatsAppWebhook(key, ingest, redis)).resolves.toEqual({ status: "missing" });
    expect(ingest).toHaveBeenCalledTimes(1);
  });

  it("cuenta los que siguen esperando para la revisión diaria", async () => {
    const redis = fakeRedis();
    redis.store.set(getWhatsAppReplayKey("a"), {});
    redis.store.set(getWhatsAppReplayKey("b"), {});
    redis.store.set("otra:cosa", {});
    expect(await countPendingWhatsAppReplays(redis)).toBe(2);
  });
});
