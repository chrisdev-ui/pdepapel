import { Redis } from "@upstash/redis";

import { runInBackground } from "@/lib/background";
import { hasInsufficientCreditReason, mentionsInsufficientCredit } from "@/lib/envioclick-errors";
import { safeError } from "@/lib/log-redaction";
import { sendWebPushToStore, type WebPushPayload, type WebPushResult } from "@/lib/web-push";

/**
 * EnvioClick cobra cada guía del saldo prepagado de la cuenta. Sin saldo, la guía de un pedido
 * pagado no se crea y el pedido se queda en «Por despachar» (pasó el 2026-11-03). Aviso a la dueña
 * por Web Push, uno por tienda y por día de Bogotá, con la referencia del pedido y nada más.
 *
 * EnvioClick no publica un endpoint de saldo, así que no hay aviso previo por umbral: solo este,
 * en el primer fallo.
 */
const ALERT_TTL_SECONDS = 60 * 60 * 36;

export function isInsufficientCreditError(error: unknown): boolean {
  if (hasInsufficientCreditReason(error)) return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return mentionsInsufficientCredit(message);
}

function bogotaDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(date);
}

export interface CreditAlertDeps {
  claim?: (key: string, ttlSeconds: number) => Promise<boolean>;
  push?: (storeId: string, payload: WebPushPayload) => Promise<WebPushResult>;
  /** Fuera de producción no sale nada, salvo que una prueba lo pida. */
  enabled?: boolean;
  now?: Date;
}

async function claimWithRedis(key: string, ttlSeconds: number): Promise<boolean> {
  return (await Redis.fromEnv().set(key, "1", { ex: ttlSeconds, nx: true })) === "OK";
}

export type CreditAlertResult = "sent" | "cooldown" | "skipped" | "failed";

export async function alertEnvioClickCreditExhausted(
  params: { storeId: string; orderId: string; orderNumber: string | null },
  deps: CreditAlertDeps = {},
): Promise<CreditAlertResult> {
  const enabled = deps.enabled ?? process.env.VERCEL_ENV === "production";
  if (!enabled) return "skipped";
  const claim = deps.claim ?? claimWithRedis;
  const push = deps.push ?? sendWebPushToStore;
  const day = bogotaDay(deps.now ?? new Date());
  try {
    if (!(await claim(`alert:envioclick-credit:${params.storeId}:${day}`, ALERT_TTL_SECONDS))) return "cooldown";
    const order = params.orderNumber ? `del pedido ${params.orderNumber}` : "de un pedido pagado";
    await push(params.storeId, {
      title: "EnvioClick sin saldo",
      body: `No se pudo crear la guía ${order}: la cuenta de EnvioClick no tiene crédito. Recarga y crea la guía desde el pedido.`,
      url: `/${params.storeId}/pedidos/${params.orderId}`,
      tag: "envioclick-credito",
    });
    return "sent";
  } catch (error) {
    console.error("[ENVIOCLICK_CREDIT_ALERT] No se pudo avisar:", safeError(error));
    return "failed";
  }
}

/** Para el camino de la guía: nunca la retrasa ni la hace fallar. */
export function alertIfInsufficientCredit(error: unknown, params: { storeId: string; orderId: string; orderNumber: string | null }): void {
  if (!isInsufficientCreditError(error)) return;
  runInBackground("aviso de EnvioClick sin saldo", () => alertEnvioClickCreditExhausted(params));
}
