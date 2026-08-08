import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from "@prisma/client";

import { getMercadoLibreHealthSummary } from "./health";
import { sendMercadoLibreHealthNotification } from "./health-notification";
import prismadb from "@/lib/prismadb";

type MercadoLibreHealthCheckResult = {
  connectionId: string;
  issues: number;
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
        const summary = await getMercadoLibreHealthSummary(connection.id, {
          includeFinancials: false,
        });
        await sendMercadoLibreHealthNotification({
          storeId: connection.storeId,
          summary,
        });
        return { connectionId: connection.id, issues: summary.issues.length };
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
