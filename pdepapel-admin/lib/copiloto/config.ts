/**
 * El copiloto existe solo con su conexión de solo lectura. Sin
 * `COPILOT_DATABASE_URL` no hay menú, ni página, ni ruta: nunca usa la
 * conexión del panel (`DATABASE_URL`), que puede escribir.
 */
export function isCopilotConfigured(environment: Record<string, string | undefined> = process.env): boolean {
  return Boolean(environment.COPILOT_DATABASE_URL?.trim());
}

/** Modo «rápido»: respuestas cortas, resúmenes. */
export const COPILOT_FAST_MODEL = "gpt-6-luna";
/** Modo «a fondo»: finanzas, estrategia, análisis de varios pasos. */
export const COPILOT_DEEP_MODEL = "gpt-6.1-sol";
export type CopilotMode = "rapido" | "a_fondo";

/** USD por millón de tokens (developers.openai.com/api/docs/pricing, leído 2026-10-10). */
export const COPILOT_PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  [COPILOT_FAST_MODEL]: { input: 0.1, cachedInput: 0.01, output: 0.5 },
  [COPILOT_DEEP_MODEL]: { input: 2, cachedInput: 0.1, output: 10 },
};

export const COPILOT_DAILY_SPEND_CAP_USD = 1;
export const COPILOT_MONTHLY_SPEND_CAP_USD = 15;
/** Pasado este gasto del mes, «a fondo» se apaga y todo va al modelo rápido. */
export const COPILOT_DEEP_MODE_CUTOFF = 0.7;
/** Lo que se reserva antes de un mensaje: el peor caso de 6 pasos en el modelo fuerte. */
export const COPILOT_RESERVE_USD = { [COPILOT_FAST_MODEL]: 0.01, [COPILOT_DEEP_MODEL]: 0.12 } as const;

export const COPILOT_MAX_STEPS = 6;
/** Se corta a los 50 s para cerrar con un mensaje antes del límite de 60 s de la función. */
export const COPILOT_TIMEOUT_MS = 50_000;
export const COPILOT_RATE_LIMIT_PER_HOUR = 30;
export const COPILOT_RATE_LIMIT_PER_DAY = 150;

export function estimateCopilotCostUsd(
  model: string,
  usage: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; reasoningTokens?: number },
): number {
  const price = COPILOT_PRICES[model] ?? COPILOT_PRICES[COPILOT_DEEP_MODEL];
  const cached = usage.cachedInputTokens ?? 0;
  const fresh = Math.max(0, (usage.inputTokens ?? 0) - cached);
  // En la API de OpenAI el razonamiento ya viene dentro de los tokens de salida.
  const output = usage.outputTokens ?? 0;
  return (fresh * price.input + cached * price.cachedInput + output * price.output) / 1e6;
}
