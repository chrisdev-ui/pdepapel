import { createHash } from "node:crypto";

import prismadb from "@/lib/prismadb";

/**
 * Avisos push del panel (estándar Web Push con llaves VAPID) a los aparatos
 * de la dueña. Opcional: sin las tres variables el panel dice «no
 * configurado» y no se manda nada. Nunca lleva datos de clientas.
 */
export interface WebPushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export const MAX_WEB_PUSH_SUBSCRIPTIONS_PER_STORE = 10;
/** Un aviso de «te esperan» viejo ya no sirve: el servicio push lo descarta a los 10 min. */
const PUSH_TTL_SECONDS = 600;
const PUSH_TIMEOUT_MS = 5000;

export type WebPushConfigReason =
  | "missing_public"
  | "missing_private"
  | "missing_subject"
  | "bad_subject_format"
  | "bad_public_key_format"
  | "bad_private_key_format";

type WebPushSource = { publicKey?: string; privateKey?: string; subject?: string };

const fromEnv = (): WebPushSource => ({
  // Directo de process.env, como otras integraciones opcionales: declaradas en lib/env.mjs, nunca obligatorias.
  publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY,
  privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
  subject: process.env.WEB_PUSH_VAPID_SUBJECT,
});

/** base64url sin relleno (se tolera un «=» final) y con el largo exacto de la llave VAPID. */
const isBase64Url = (value: string, length: number) => {
  const bare = value.replace(/=+$/, "");
  return bare.length === length && /^[A-Za-z0-9_-]+$/.test(bare);
};

/**
 * La configuración o por qué falta, sin mirar los valores más allá de su
 * forma: pública = punto P-256 sin comprimir (65 bytes → 87 caracteres, empieza
 * por «B»), privada = 32 bytes (43 caracteres), remitente `mailto:` o `https://`.
 */
export function diagnoseWebPushConfig(source: WebPushSource = fromEnv()): { config: WebPushConfig | null; reason: WebPushConfigReason | null } {
  const publicKey = source.publicKey?.trim();
  const privateKey = source.privateKey?.trim();
  const subject = source.subject?.trim();
  const fail = (reason: WebPushConfigReason) => ({ config: null, reason });
  if (!publicKey) return fail("missing_public");
  if (!privateKey) return fail("missing_private");
  if (!subject) return fail("missing_subject");
  if (!/^(mailto:|https:\/\/)/.test(subject)) return fail("bad_subject_format");
  if (!isBase64Url(publicKey, 87) || !publicKey.startsWith("B")) return fail("bad_public_key_format");
  if (!isBase64Url(privateKey, 43)) return fail("bad_private_key_format");
  return { config: { publicKey, privateKey, subject }, reason: null };
}

let loggedReason = false;

/** Lo mismo desde el entorno, anotando el motivo una vez por arranque (solo el motivo, nunca los valores). */
export function getWebPushStatus(): { config: WebPushConfig | null; reason: WebPushConfigReason | null } {
  const status = diagnoseWebPushConfig(fromEnv());
  if (status.reason && !loggedReason) {
    loggedReason = true;
    console.warn("[WEB_PUSH] Avisos push no configurados", { reason: status.reason });
  }
  return status;
}

export function getWebPushConfig(source?: WebPushSource): WebPushConfig | null {
  return source ? diagnoseWebPushConfig(source).config : getWebPushStatus().config;
}

/** La llave única de una suscripción: el endpoint puede pasar de 500 caracteres. */
export const hashPushEndpoint = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

/** «Safari en iPhone»: para que la dueña reconozca el aparato en Configuración. */
export function describePushDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome|CriOS/.test(ua)
          ? "Chrome"
          : /Safari/.test(ua)
            ? "Safari"
            : null;
  const label = [browser, os].filter(Boolean).join(" en ");
  return label ? label.slice(0, 120) : null;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  /** Avisos con la misma etiqueta se reemplazan en el aparato en vez de apilarse. */
  tag?: string;
}

interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type WebPushSend = (subscription: StoredSubscription, payload: string, config: WebPushConfig) => Promise<void>;

const defaultSend: WebPushSend = async (subscription, payload, config) => {
  const webpush = (await import("web-push")).default;
  await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
    TTL: PUSH_TTL_SECONDS,
    timeout: PUSH_TIMEOUT_MS,
    urgency: "high",
    vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
  });
};

export interface WebPushResult {
  configured: boolean;
  devices: number;
  delivered: number;
  removed: number;
  failed: number;
}

const statusOf = (error: unknown) =>
  error && typeof error === "object" && "statusCode" in error && typeof (error as { statusCode: unknown }).statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : null;

/**
 * Manda el aviso a todos los aparatos de la tienda. No lanza nunca: una
 * suscripción vencida (404/410) se borra, cualquier otro error suma un fallo.
 */
export async function sendWebPushToStore(
  storeId: string,
  payload: WebPushPayload,
  deps: { config?: WebPushConfig | null; send?: WebPushSend; now?: Date } = {},
): Promise<WebPushResult> {
  const config = deps.config === undefined ? getWebPushConfig() : deps.config;
  const result: WebPushResult = { configured: Boolean(config), devices: 0, delivered: 0, removed: 0, failed: 0 };
  if (!config) return result;
  try {
    const subscriptions = await prismadb.webPushSubscription.findMany({
      where: { storeId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
      take: MAX_WEB_PUSH_SUBSCRIPTIONS_PER_STORE,
    });
    result.devices = subscriptions.length;
    const body = JSON.stringify(payload);
    const send = deps.send ?? defaultSend;
    await Promise.all(
      subscriptions.map(async (subscription) => {
        let status: number | null = null;
        let ok = false;
        try {
          await send(subscription, body, config);
          ok = true;
        } catch (error) {
          status = statusOf(error);
        }
        const where = { id: subscription.id };
        if (ok) {
          result.delivered += 1;
          await prismadb.webPushSubscription.updateMany({ where, data: { lastSuccessAt: deps.now ?? new Date(), failureCount: 0 } });
        } else if (status === 404 || status === 410) {
          result.removed += 1;
          await prismadb.webPushSubscription.deleteMany({ where });
        } else {
          result.failed += 1;
          console.warn("[WEB_PUSH] No se pudo mandar el aviso", { status, subscriptionId: subscription.id });
          await prismadb.webPushSubscription.updateMany({ where, data: { failureCount: { increment: 1 } } });
        }
      }),
    );
  } catch (error) {
    console.error("[WEB_PUSH] Falló el envío de avisos", { message: error instanceof Error ? error.message : "unknown" });
  }
  return result;
}

export async function countWebPushSubscriptions(storeId: string): Promise<number> {
  return prismadb.webPushSubscription.count({ where: { storeId } });
}
