import {
  COPILOT_DAILY_SPEND_CAP_USD,
  COPILOT_DEEP_MODE_CUTOFF,
  COPILOT_MONTHLY_SPEND_CAP_USD,
} from "@/lib/copiloto/config";

/**
 * Presupuesto propio del copiloto, aparte del tope compartido de OpenAI
 * (`ai:openai:spend:<día>`): una conversación larga no puede dejar sin
 * servicio al bot ni al asistente de productos. Fechas en UTC, como el tope
 * compartido.
 */
export const copilotDaySpendKey = (now: Date) => `ai:copiloto:spend:${now.toISOString().slice(0, 10)}`;
export const copilotMonthSpendKey = (now: Date) => `ai:copiloto:spend:${now.toISOString().slice(0, 7)}`;

export interface CopilotBudgetStore {
  get: (key: string) => Promise<unknown>;
  incrbyfloat: (key: string, value: number) => Promise<unknown>;
  expire: (key: string, seconds: number) => Promise<unknown>;
}

export interface CopilotSpend {
  today: number;
  month: number;
}

export async function readCopilotSpend(store: CopilotBudgetStore, now = new Date()): Promise<CopilotSpend> {
  const [today, month] = await Promise.all([store.get(copilotDaySpendKey(now)), store.get(copilotMonthSpendKey(now))]);
  return { today: Number(today ?? 0) || 0, month: Number(month ?? 0) || 0 };
}

export type CopilotBudgetDecision =
  | { ok: true; deepAllowed: boolean; spend: CopilotSpend }
  | { ok: false; reason: "daily" | "monthly" | "unavailable" };

/**
 * ¿Alcanza para un mensaje más (con su reserva)? Sin Redis no se puede contar
 * el gasto, así que el copiloto no arranca: al revés que el resto del panel.
 */
export async function checkCopilotBudget(
  store: CopilotBudgetStore | null,
  reserveUsd: number,
  now = new Date(),
): Promise<CopilotBudgetDecision> {
  if (!store) return { ok: false, reason: "unavailable" };
  let spend: CopilotSpend;
  try {
    spend = await readCopilotSpend(store, now);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (spend.month + reserveUsd > COPILOT_MONTHLY_SPEND_CAP_USD) return { ok: false, reason: "monthly" };
  if (spend.today + reserveUsd > COPILOT_DAILY_SPEND_CAP_USD) return { ok: false, reason: "daily" };
  return {
    ok: true,
    deepAllowed: spend.month < COPILOT_MONTHLY_SPEND_CAP_USD * COPILOT_DEEP_MODE_CUTOFF,
    spend,
  };
}

/** Suma lo que de verdad costó. Un error aquí se registra y no tumba la respuesta. */
export async function recordCopilotSpend(store: CopilotBudgetStore | null, usd: number, now = new Date()) {
  if (!store || !(usd > 0)) return;
  try {
    await store.incrbyfloat(copilotDaySpendKey(now), usd);
    await store.expire(copilotDaySpendKey(now), 2 * 24 * 60 * 60);
    await store.incrbyfloat(copilotMonthSpendKey(now), usd);
    await store.expire(copilotMonthSpendKey(now), 40 * 24 * 60 * 60);
  } catch (error) {
    console.error("[COPILOTO] No se pudo anotar el gasto", { message: error instanceof Error ? error.message : "unknown" });
  }
}
