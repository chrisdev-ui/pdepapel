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
import prismadb from "@/lib/prismadb";

type MercadoLibreHealthCheckResult = {
  connectionId: string;
  /** Alertas abiertas hoy. */
  issues: number;
  /** Las que salieron en el correo (nuevas o cambiadas); 0 = no hubo correo. */
  notified: number;
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
        status: MarketplaceConnectionStatus.CONNECTED,
      },
      select: { id: true, storeId: true },
    });

    const results = await Promise.allSettled(
      connections.map(async (connection) => {
        const now = new Date();
        const summary = await getMercadoLibreHealthSummary(connection.id, {
          includeFinancials: false,
        });
        // Solo lo nuevo o lo que cambió desde el último aviso, y nada de lo
        // marcado como revisado (#8). Dos corridas el mismo día: la segunda
        // no encuentra nada que tomar y no manda correo.
        const issues = identifyIssues(summary.issues);
        // Otra corrida de esta conexión está en curso: ella avisa.
        if (!(await acquireRunLock(connection.id, { now }))) {
          return {
            connectionId: connection.id,
            issues: issues.length,
            notified: 0,
          };
        }
        try {
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
              };
            }
          }
          return {
            connectionId: connection.id,
            issues: issues.length,
            notified: claims.length,
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
