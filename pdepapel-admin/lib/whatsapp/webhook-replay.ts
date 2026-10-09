import { createHash } from "node:crypto";

import { Client } from "@upstash/qstash";
import { Redis } from "@upstash/redis";

import { getWhatsAppQueueConfigurationStatus } from "@/lib/whatsapp/queue";

/**
 * Reintento del webhook de WhatsApp cuando la base no puede guardar.
 *
 * El webhook responde 200 igual (si no, Meta desactiva la suscripción) y
 * Meta no reenvía. Por eso el cuerpo ya verificado se guarda en Redis, que no
 * depende de MySQL, y QStash lo vuelve a pasar por la misma entrada hasta que
 * queda guardado. La llave única de `(provider, eventKey)` hace que guardarlo
 * dos veces no duplique nada.
 */

export const WHATSAPP_REPLAY_PATH = "/api/internal/marketplaces/whatsapp/replay";
export const WHATSAPP_REPLAY_PREFIX = "whatsapp:webhook:replay:";
const REPLAY_TTL_SECONDS = 7 * 24 * 3600;
const REPLAY_DELAY = "30s" as const;
const REPLAY_RETRIES = 5;

type Environment = Record<string, string | undefined>;
export interface ReplayRedis {
  set(key: string, value: StashedWebhook, options: { ex: number }): Promise<unknown>;
  get(key: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  scan(cursor: string | number, options: { match: string; count?: number }): Promise<[string | number, string[]]>;
}
type Publish = (message: { url: string; body: { key: string }; delay: typeof REPLAY_DELAY; retries: number }) => Promise<unknown>;

export interface StashedWebhook {
  body: string;
  eventKey: string;
  receivedAt: string;
}

export function getWhatsAppReplayKey(eventKey: string) {
  return `${WHATSAPP_REPLAY_PREFIX}${createHash("sha256").update(eventKey).digest("hex").slice(0, 32)}`;
}

export function getWhatsAppReplayUrl(environment: Environment = process.env) {
  if (!environment.ADMIN_WEB_URL) throw new Error("ADMIN_WEB_URL es requerida para reintentar WhatsApp");
  return new URL(WHATSAPP_REPLAY_PATH, environment.ADMIN_WEB_URL).toString();
}

let defaultRedis: ReplayRedis | undefined;
const getRedis = (): ReplayRedis => (defaultRedis ??= Redis.fromEnv());

function defaultPublish(environment: Environment): Publish {
  return async ({ url, body, delay, retries }) => {
    const client = new Client({ token: environment.QSTASH_TOKEN, enableTelemetry: false });
    return client.publishJSON({
      url,
      body,
      delay,
      retries,
      timeout: 50,
      label: ["whatsapp", "webhook-replay"],
    });
  };
}

export async function stashFailedWhatsAppWebhook(
  webhook: { eventKey: string; body: string },
  deps: { redis?: ReplayRedis; publish?: Publish; environment?: Environment } = {},
): Promise<{ stashed: boolean; queued: boolean }> {
  const environment = deps.environment ?? process.env;
  const key = getWhatsAppReplayKey(webhook.eventKey);
  try {
    const stash: StashedWebhook = { ...webhook, receivedAt: new Date().toISOString() };
    await (deps.redis ?? getRedis()).set(key, stash, { ex: REPLAY_TTL_SECONDS });
  } catch (error) {
    console.error("[WHATSAPP_WEBHOOK_REPLAY] No se pudo guardar la copia para reintentar", {
      key,
      message: error instanceof Error ? error.message : "unknown",
    });
    return { stashed: false, queued: false };
  }

  if (!getWhatsAppQueueConfigurationStatus(environment).configured) return { stashed: true, queued: false };
  try {
    await (deps.publish ?? defaultPublish(environment))({
      url: getWhatsAppReplayUrl(environment),
      body: { key },
      delay: REPLAY_DELAY,
      retries: REPLAY_RETRIES,
    });
    return { stashed: true, queued: true };
  } catch (error) {
    console.error("[WHATSAPP_WEBHOOK_REPLAY] No se pudo encolar el reintento", {
      key,
      message: error instanceof Error ? error.message : "unknown",
    });
    return { stashed: true, queued: false };
  }
}

/** Lanza si la entrada vuelve a fallar: el 500 hace que QStash reintente. */
export async function replayStashedWhatsAppWebhook(
  key: string,
  ingest: (body: string) => Promise<{ eventId?: string }>,
  redis: ReplayRedis = getRedis(),
): Promise<{ status: "missing" } | { status: "stored"; eventId: string | null }> {
  const stash = (await redis.get(key)) as StashedWebhook | null;
  if (!stash) return { status: "missing" };
  const result = await ingest(stash.body);
  await redis.del(key);
  return { status: "stored", eventId: result.eventId ?? null };
}

export async function countPendingWhatsAppReplays(redis: ReplayRedis = getRedis()) {
  let cursor: string | number = "0";
  let total = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: `${WHATSAPP_REPLAY_PREFIX}*`, count: 100 });
    total += keys.length;
    cursor = next;
  } while (String(cursor) !== "0");
  return total;
}
