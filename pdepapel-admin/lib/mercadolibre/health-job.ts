import { recordJobRun } from "@/lib/job-runs";

import { processMercadoLibreHealthChecks, type MercadoLibreHealthCheckRun } from "./health-cron";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** La línea de Sistemas: solo cuentas, nunca datos de publicaciones. */
export function healthJobDetail(result: MercadoLibreHealthCheckRun) {
  const incomplete = result.processed.filter((run) => run.reconcile === "failed" || run.reconcile === "reauth").length;
  const refreshed = result.processed.reduce((sum, run) => sum + (run.applied?.typeRefreshed ?? 0), 0);
  const siteFallback = result.processed.reduce((sum, run) => sum + (run.applied?.siteFallback ?? 0), 0);
  return {
    incomplete,
    detail: [
      plural(result.processed.length, "conexión revisada", "conexiones revisadas"),
      result.failed ? `${result.failed} con error` : null,
      incomplete ? `${incomplete} sin revisar contra Mercado Libre` : null,
      refreshed ? `${plural(refreshed, "publicación", "publicaciones")} con tipo o categoría al día` : null,
      siteFallback ? `${plural(siteFallback, "conexión", "conexiones")} sin sitio: se usó MCO` : null,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

/** La revisión diaria con su registro en Sistemas; la llaman QStash y el disparo manual. */
export async function runMercadoLibreHealthJob() {
  const result = await processMercadoLibreHealthChecks();
  const { incomplete, detail } = healthJobDetail(result);
  await recordJobRun("mercadolibre-health", { ok: result.failed === 0 && incomplete === 0, detail });
  return result;
}
