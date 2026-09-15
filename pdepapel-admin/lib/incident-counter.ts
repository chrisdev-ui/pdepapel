import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

/** Gancho de pruebas: inyectar un cliente tipo Redis. */
export function setIncidentCounterRedis(client: Redis | null) {
  redis = client;
}

/**
 * Contar algo que no debería pasar mucho, y gritar si pasa mucho.
 *
 * No es un sistema de métricas: es una línea de log que se distingue de las
 * demás cuando algo empieza a repetirse. Los avisos sueltos ya se escriben en
 * el log, pero uno suelto no dice nada —el envío cambia de precio de vez en
 * cuando y es normal—. Lo que importa es enterarse si empieza a pasar a
 * docenas, que es cuando se están perdiendo ventas.
 *
 * Usa el mismo Redis que el limitador. Si Redis no está o falla, no pasa nada:
 * se cuenta como que no se llegó al umbral y la compra sigue su camino. Esto
 * nunca puede ser el motivo de que un pedido no entre.
 */
export async function countIncident(input: {
  /** Nombre corto y estable; es lo que se busca en los logs. */
  kind: string;
  /** A partir de cuántas en la ventana se escribe la línea gorda. */
  threshold: number;
  /** Tamaño de la ventana en segundos. */
  windowSeconds: number;
  /** Se adjunta a la línea de alerta para no tener que ir a buscarlo. */
  context?: Record<string, unknown>;
}): Promise<{ count: number; alerted: boolean }> {
  const ventana = Math.floor(Date.now() / (input.windowSeconds * 1000));
  const key = `incident:${input.kind}:${ventana}`;

  try {
    const client = getRedis();
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, input.windowSeconds * 2);

    // Solo al cruzar el umbral, no en cada una a partir de ahí: si no, un mal
    // rato llenaría el log de alertas idénticas y dejarían de leerse.
    if (count === input.threshold) {
      console.error(
        `🚨 [ALERTA] ${input.kind} lleva ${count} veces en ${Math.round(input.windowSeconds / 60)} min`,
        { kind: input.kind, count, windowSeconds: input.windowSeconds, ...input.context },
      );
      return { count, alerted: true };
    }
    return { count, alerted: false };
  } catch (error) {
    console.warn("[INCIDENT_COUNTER] No se pudo contar", {
      kind: input.kind,
      message: error instanceof Error ? error.message : "desconocido",
    });
    return { count: 0, alerted: false };
  }
}

/** Cuántas veces por hora hacen falta para que esto deje de ser normal. */
export const SHIPPING_RATE_INCIDENT = {
  kind: "checkout_shipping_rate_recovery",
  threshold: 10,
  windowSeconds: 60 * 60,
} as const;
