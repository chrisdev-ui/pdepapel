import type { PrismaClient } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import type { ContainerMemoryReading } from "@/lib/railway-metrics";

/**
 * Revisión diaria de MySQL. Cuenta la memoria que MySQL lleva (no la del
 * contenedor: esa sigue en Railway) y las conexiones, y marca cualquier
 * reinicio de las últimas 24 h, que es como se ve a la mañana siguiente que
 * la base se quedó sin memoria de noche.
 */

const MB = 1024 * 1024;
const WARN_RATIO = 0.7;
const DEFAULT_MEMORY_LIMIT_MB = 8192;
const RECENT_RESTART_SECONDS = 24 * 3600;
/** Con la configuración actual ronda 0,5 GB: pasar de 2 GB o crecer 300 MB en un día es que algo vuelve a acumularse. */
const CONTAINER_ALERT_MB = 2048;
const CONTAINER_GROWTH_ALERT_MB = 300;
const GB_TO_MB = 1024;

export interface DbHealthReading {
  trackedBytes: number;
  uptimeSeconds: number;
  threadsConnected: number;
  maxUsedConnections: number;
  maxConnections: number;
}

export function resolveDbMemoryLimitMb(
  environment: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(environment.DB_MEMORY_LIMIT_MB);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MEMORY_LIMIT_MB;
}

export async function readDbHealth(
  db: Pick<PrismaClient, "$queryRawUnsafe"> = prismadb,
): Promise<DbHealthReading> {
  const [memory, status, limits] = await Promise.all([
    db.$queryRawUnsafe<{ bytes: bigint | number | null }[]>(
      "SELECT SUM(CURRENT_NUMBER_OF_BYTES_USED) AS bytes FROM performance_schema.memory_summary_global_by_event_name",
    ),
    db.$queryRawUnsafe<{ Variable_name: string; Value: string }[]>(
      "SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime', 'Threads_connected', 'Max_used_connections')",
    ),
    db.$queryRawUnsafe<{ max: bigint | number }[]>("SELECT @@max_connections AS max"),
  ]);
  const value = (name: string) => Number(status.find((row) => row.Variable_name === name)?.Value ?? 0);
  return {
    trackedBytes: Number(memory[0]?.bytes ?? 0),
    uptimeSeconds: value("Uptime"),
    threadsConnected: value("Threads_connected"),
    maxUsedConnections: value("Max_used_connections"),
    maxConnections: Number(limits[0]?.max ?? 0),
  };
}

const percent = (part: number, whole: number) => Math.round((100 * part) / Math.max(1, whole));

function describeUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} días`;
}

function judgeContainer(container: ContainerMemoryReading | undefined) {
  if (!container) return { warnings: [] as string[], summary: "" };
  if (!container.ok) return { warnings: [] as string[], summary: ` Contenedor: ${container.reason}.` };
  const currentMb = Math.round(container.currentGb * GB_TO_MB);
  const growthMb = container.growthGb === null ? null : Math.round(container.growthGb * GB_TO_MB);
  const warnings: string[] = [];
  if (currentMb > CONTAINER_ALERT_MB) {
    warnings.push(`El contenedor de MySQL usa ${currentMb} MB, más de los ${CONTAINER_ALERT_MB} MB que se esperan.`);
  }
  if (growthMb !== null && growthMb > CONTAINER_GROWTH_ALERT_MB && container.dayAgoGb !== null) {
    warnings.push(
      `El contenedor de MySQL creció ${growthMb} MB en 24 h (de ${Math.round(container.dayAgoGb * GB_TO_MB)} MB a ${currentMb} MB).`,
    );
  }
  const growth = growthMb === null ? "" : ` (${growthMb >= 0 ? "+" : ""}${growthMb} MB en 24 h)`;
  return { warnings, summary: ` Contenedor en Railway: ${currentMb} MB${growth}.` };
}

export function judgeDbHealth(
  input: DbHealthReading & {
    limitMb: number;
    pendingWhatsAppReplays: number;
    container?: ContainerMemoryReading;
  },
) {
  const memoryMb = Math.round(input.trackedBytes / MB);
  const container = judgeContainer(input.container);
  const warnings: string[] = [...container.warnings];

  if (input.trackedBytes >= input.limitMb * MB * WARN_RATIO) {
    warnings.push(
      `MySQL ya usa ${memoryMb} MB, el ${percent(memoryMb, input.limitMb)} % de los ${input.limitMb} MB del servicio.`,
    );
  }
  const connectionsLimit = input.maxConnections * WARN_RATIO;
  if (input.threadsConnected >= connectionsLimit || input.maxUsedConnections >= connectionsLimit) {
    warnings.push(
      `Conexiones altas: ${input.threadsConnected} abiertas y un pico de ${input.maxUsedConnections} de ${input.maxConnections}.`,
    );
  }
  if (input.uptimeSeconds < RECENT_RESTART_SECONDS) {
    warnings.push(
      `MySQL se reinició hace ${describeUptime(input.uptimeSeconds)}. Si no fue un reinicio planeado, revisa la memoria del servicio en Railway.`,
    );
  }
  if (input.pendingWhatsAppReplays > 0) {
    warnings.push(
      `${input.pendingWhatsAppReplays} ${input.pendingWhatsAppReplays === 1 ? "evento" : "eventos"} de WhatsApp siguen esperando reintento: la base no los pudo guardar.`,
    );
  }

  const summary = `Memoria contada por MySQL: ${memoryMb} MB de ${input.limitMb} MB (${percent(memoryMb, input.limitMb)} %).${container.summary} Conexiones: ${input.threadsConnected} de ${input.maxConnections} (pico ${input.maxUsedConnections}). Encendida hace ${describeUptime(input.uptimeSeconds)}.`;
  return {
    alert: warnings.length > 0,
    /** Solo el contenedor manda correo: lo demás ya se ve en «Sistemas». */
    containerAlert: container.warnings.length > 0,
    containerWarnings: container.warnings,
    warnings,
    detail: warnings.length > 0 ? `${warnings.join(" ")} ${summary}` : summary,
  };
}
