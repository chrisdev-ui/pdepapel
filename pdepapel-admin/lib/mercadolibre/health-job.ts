import { recordJobRun } from "@/lib/job-runs";

import { processMercadoLibreHealthChecks } from "./health-cron";

/** La revisión diaria con su registro en Sistemas; la llaman QStash y el disparo manual. */
export async function runMercadoLibreHealthJob() {
  const result = await processMercadoLibreHealthChecks();
  const incomplete = result.processed.filter((run) => run.reconcile === "failed" || run.reconcile === "reauth").length;
  await recordJobRun("mercadolibre-health", {
    ok: result.failed === 0 && incomplete === 0,
    detail: `${result.processed.length} ${result.processed.length === 1 ? "conexión revisada" : "conexiones revisadas"}${result.failed ? `, ${result.failed} con error` : ""}${incomplete ? `, ${incomplete} sin revisar contra Mercado Libre` : ""}`,
  });
  return result;
}
