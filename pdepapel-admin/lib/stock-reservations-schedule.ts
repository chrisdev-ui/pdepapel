import { Client, Receiver } from "@upstash/qstash";

type Environment = Record<string, string | undefined>;

/** Id fijo: crear la programación otra vez la actualiza en vez de duplicarla. */
export const STOCK_RESERVATIONS_SCHEDULE_ID = "pdepapel-stock-reservations-hourly";
/** Cada hora en punto; la corrida de las 13:00 UTC (8:00 en Colombia) manda además el resumen. */
export const STOCK_RESERVATIONS_CRON = "0 * * * *";
export const STOCK_RESERVATIONS_SWEEP_PATH = "/api/internal/stock-reservations/sweep";

export function getStockReservationsSweepUrl(environment: Environment = process.env) {
  if (!environment.ADMIN_WEB_URL) throw new Error("ADMIN_WEB_URL es requerida para programar las reservas");
  return new URL(STOCK_RESERVATIONS_SWEEP_PATH, environment.ADMIN_WEB_URL).toString();
}

export function getStockReservationsScheduleConfig(environment: Environment = process.env) {
  return {
    scheduleId: STOCK_RESERVATIONS_SCHEDULE_ID,
    destination: getStockReservationsSweepUrl(environment),
    cron: STOCK_RESERVATIONS_CRON,
    method: "POST" as const,
    body: "{}",
    headers: { "Content-Type": "application/json" },
    // Un reintento no duplica nada: cada cambio es un reclamo por estado y los avisos tienen candado.
    retries: 2,
    timeout: 60,
    label: ["stock-reservations"],
  };
}

export async function ensureStockReservationsSchedule(environment: Environment = process.env) {
  if (!environment.QSTASH_TOKEN) throw new Error("QSTASH_TOKEN no está configurada");
  const client = new Client({ token: environment.QSTASH_TOKEN, enableTelemetry: false });
  await client.schedules.create(getStockReservationsScheduleConfig(environment));
  const schedule = (await client.schedules.get(STOCK_RESERVATIONS_SCHEDULE_ID)) as unknown as Record<string, unknown>;
  return {
    scheduleId: STOCK_RESERVATIONS_SCHEDULE_ID,
    cron: schedule.cron ?? null,
    destination: schedule.destination ?? null,
    isPaused: schedule.isPaused ?? null,
    nextScheduleTime: schedule.nextScheduleTime ?? null,
  };
}

export async function verifyStockReservationsRequest(
  body: string,
  signature: string | null,
  region: string | null,
  environment: Environment = process.env,
): Promise<boolean> {
  if (!signature || !environment.QSTASH_CURRENT_SIGNING_KEY || !environment.QSTASH_NEXT_SIGNING_KEY) return false;
  const receiver = new Receiver({
    currentSigningKey: environment.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: environment.QSTASH_NEXT_SIGNING_KEY,
  });
  try {
    return await receiver.verify({ body, signature, url: getStockReservationsSweepUrl(environment), upstashRegion: region ?? undefined });
  } catch {
    return false;
  }
}
