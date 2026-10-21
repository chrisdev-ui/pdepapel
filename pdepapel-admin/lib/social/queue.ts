import { Client, Receiver } from "@upstash/qstash";

import type { SyncContinuation } from "./sync";

/**
 * Cola de la sincronización de redes: un mensaje por cuenta, uno a la vez por
 * cuenta, y la continuación (presupuesto agotado o la API pidió esperar) vuelve
 * a la cola con su retraso. Unos 8–12 mensajes al día del cupo de QStash.
 */
type Environment = Record<string, string | undefined>;

export const SOCIAL_SYNC_PATH = "/api/internal/social/sync";

export interface SocialSyncMessage {
  accountId: string;
  continuation?: SyncContinuation | null;
}

export function isSocialQueueConfigured(environment: Environment = process.env) {
  return ["QSTASH_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY", "ADMIN_WEB_URL"].every((name) => Boolean(environment[name]?.trim()));
}

export function getSocialSyncUrl(environment: Environment = process.env) {
  if (!environment.ADMIN_WEB_URL) throw new Error("ADMIN_WEB_URL es requerida para la sincronización de redes");
  return new URL(SOCIAL_SYNC_PATH, environment.ADMIN_WEB_URL).toString();
}

export async function enqueueSocialSync(message: SocialSyncMessage, delaySeconds = 0, environment: Environment = process.env) {
  if (!isSocialQueueConfigured(environment)) return false;
  const client = new Client({ token: environment.QSTASH_TOKEN, enableTelemetry: false });
  await client.publishJSON({
    url: getSocialSyncUrl(environment),
    body: message,
    retries: 2,
    timeout: 60,
    ...(delaySeconds > 0 ? { delay: `${BigInt(Math.ceil(delaySeconds))}s` as const } : {}),
    flowControl: { key: `social-account-${message.accountId}`, parallelism: 1 },
    label: ["social", "sync"],
  });
  return true;
}

export async function verifySocialSyncRequest(body: string, signature: string | null, region: string | null, environment: Environment = process.env) {
  if (!signature || !environment.QSTASH_CURRENT_SIGNING_KEY || !environment.QSTASH_NEXT_SIGNING_KEY) return false;
  const receiver = new Receiver({ currentSigningKey: environment.QSTASH_CURRENT_SIGNING_KEY, nextSigningKey: environment.QSTASH_NEXT_SIGNING_KEY });
  try {
    return await receiver.verify({ body, signature, url: getSocialSyncUrl(environment), upstashRegion: region ?? undefined });
  } catch {
    return false;
  }
}

export function parseSocialSyncMessage(body: string): SocialSyncMessage | null {
  try {
    const parsed = JSON.parse(body) as Partial<SocialSyncMessage>;
    if (typeof parsed.accountId !== "string" || !parsed.accountId) return null;
    const continuation = parsed.continuation;
    if (continuation && (!["list", "metrics"].includes(continuation.phase) || Number.isNaN(Date.parse(continuation.runStartedAt)))) return null;
    return { accountId: parsed.accountId, continuation: continuation ?? null };
  } catch {
    return null;
  }
}
