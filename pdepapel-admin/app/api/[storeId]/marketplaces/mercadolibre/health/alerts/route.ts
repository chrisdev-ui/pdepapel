import { auth } from "@clerk/nextjs/server";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreHealthSummary } from "@/lib/mercadolibre/health";
import { identifyIssues, setAlertsReviewed } from "@/lib/mercadolibre/health-alerts";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const bodySchema = z.union([
  z.object({ keys: z.array(z.string().min(1).max(191)).min(1).max(200), reviewed: z.boolean().default(true) }),
  z.object({ all: z.literal(true), reviewed: z.boolean().default(true) }),
]);

/**
 * Marca alertas de salud de Mercado Libre como revisadas, o lo deshace (#8).
 *
 * `{ keys: [...] }` para unas, `{ all: true }` para «marcar todas como
 * revisadas»; `reviewed: false` las vuelve a mostrar. Una alerta revisada
 * queda callada, en el panel y en el correo diario, hasta que su huella
 * cambie (lib/mercadolibre/health-alerts.ts).
 *
 * Recalcula las alertas aquí en vez de confiar en lo que mande el panel: la
 * huella que se guarda es la de ahora.
 */
export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ErrorFactory.InvalidRequest("Indica qué alertas marcar como revisadas");
    }

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true },
    });
    if (!connection) {
      throw ErrorFactory.NotFound("Primero conecta la cuenta de Mercado Libre");
    }

    const summary = await getMercadoLibreHealthSummary(connection.id, { includeFinancials: false });
    const issues = identifyIssues(summary.issues);
    const target = "all" in parsed.data ? { all: true as const } : { keys: parsed.data.keys };
    const updated = await setAlertsReviewed(connection.id, issues, target, parsed.data.reviewed, { userId });

    return NextResponse.json({ updated }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_HEALTH_ALERTS_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
