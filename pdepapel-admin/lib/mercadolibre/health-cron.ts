import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from "@prisma/client";

import { getMercadoLibreHealthSummary } from "./health";
import {
  acquireRunLock,
  claimAlertsToNotify,
  identifyIssues,
  releaseAlertClaims,
  releaseRunLock,
  syncAlertStates,
} from "./health-alerts";
import { sendMercadoLibreHealthNotification } from "./health-notification";
import { mergeReconcileIssues, runMercadoLibreReconcile, type ReconcileApplied } from "./reconcile-runner";
import prismadb from "@/lib/prismadb";

type MercadoLibreHealthCheckResult = {
  connectionId: string;
  /** Alertas abiertas hoy. */
  issues: number;
  /** Las que salieron en el correo (nuevas o cambiadas); 0 = no hubo correo. */
  notified: number;
  /** Resultado de la revisión contra Mercado Libre. */
  reconcile?: "ok" | "reauth" | "failed" | "skipped";
  applied?: ReconcileApplied;
};

export type MercadoLibreHealthCheckRun = {
  processed: MercadoLibreHealthCheckResult[];
  failed: number;
};

export async function processMercadoLibreHealthChecks(): Promise<MercadoLibreHealthCheckRun> {
  try {
    const connections = await prismadb.marketplaceConnection.findMany({
      where: {
        provider: MarketplaceProvider.MERCADOLIBRE,
        status: {
          in: [MarketplaceConnectionStatus.CONNECTED, MarketplaceConnectionStatus.REAUTH_REQUIRED],
        },
      },
      select: { id: true, storeId: true, sellerId: true, status: true },
    });

    const results = await Promise.allSettled(
      connections.map(async (connection): Promise<MercadoLibreHealthCheckResult> => {
        const now = new Date();
        // Otra corrida de esta conexión está en curso: ella revisa y avisa.
        if (!(await acquireRunLock(connection.id, { now }))) {
          const summary = await getMercadoLibreHealthSummary(connection.id, { includeFinancials: false });
          return {
            connectionId: connection.id,
            issues: identifyIssues(summary.issues).length,
            notified: 0,
            reconcile: "skipped",
          };
        }
        try {
          const baseSummary = await getMercadoLibreHealthSummary(connection.id, {
            includeFinancials: false,
          });
          const run =
            connection.status === MarketplaceConnectionStatus.CONNECTED
              ? await runMercadoLibreReconcile(connection, { now })
              : ({ outcome: "reauth" } as const);
          if (run.outcome === "failed") {
            console.error("Mercado Libre reconcile failed:", run.error);
          }
          const summary = { ...baseSummary, issues: mergeReconcileIssues(baseSummary.issues, run) };
          // Solo lo nuevo o lo que cambió desde el último aviso, y nada de lo
          // marcado como revisado (#8). Dos corridas el mismo día: la segunda
          // no encuentra nada que tomar y no manda correo.
          const issues = identifyIssues(summary.issues);
          const outcome = {
            reconcile: run.outcome,
            ...(run.outcome === "ok" ? { applied: run.applied } : {}),
          };
          await syncAlertStates(connection.id, issues, { now });
          const claims = await claimAlertsToNotify(connection.id, issues, {
            now,
          });
          if (claims.length > 0) {
            let result: "sent" | "skipped";
            try {
              result = await sendMercadoLibreHealthNotification({
                storeId: connection.storeId,
                summary,
                issues: claims.map((claim) => claim.issue),
                knownIssues: issues.length - claims.length,
              });
            } catch (error) {
              await releaseAlertClaims(connection.id, claims, { now });
              throw error;
            }
            if (result === "skipped") {
              await releaseAlertClaims(connection.id, claims, { now });
              return {
                connectionId: connection.id,
                issues: issues.length,
                notified: 0,
                ...outcome,
              };
            }
          }
          return {
            connectionId: connection.id,
            issues: issues.length,
            notified: claims.length,
            ...outcome,
          };
        } finally {
          await releaseRunLock(connection.id, { now });
        }
      }),
    );

    const processed = results.flatMap((result) => {
      if (result.status === "fulfilled") return [result.value];

      console.error("Mercado Libre health check failed:", result.reason);
      return [];
    });

    return {
      processed,
      failed: results.length - processed.length,
    };
  } catch (error) {
    console.error("Mercado Libre health check could not start:", error);
    return { processed: [], failed: 1 };
  }
}
