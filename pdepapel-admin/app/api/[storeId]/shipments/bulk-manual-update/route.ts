import { auth } from "@clerk/nextjs/server";
import { ShippingProvider, ShippingStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { applyShipmentStatus, CLOSED_SHIPMENT_STATUSES, isShipmentTransitionAllowed } from "@/lib/shipment-status";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const bodySchema = z.object({
  fromStatus: z.nativeEnum(ShippingStatus, { errorMap: () => ({ message: "Elige el estado actual de los envíos a corregir." }) }),
  toStatus: z.nativeEnum(ShippingStatus, { errorMap: () => ({ message: "Elige el estado nuevo." }) }),
  /** Incluir entregados y cancelados (por defecto quedan fuera). */
  includeClosed: z.boolean().default(false),
  /** Es una corrección: se permite un salto que la tabla de transiciones no contempla. */
  correction: z.boolean().default(false),
  /** Solo contar: el diálogo lo usa para mostrar cuántos envíos cambiarían. */
  dryRun: z.boolean().default(false),
});

/**
 * Corrección de envíos manuales (domiciliario, mensajería sin rastreo): mueve
 * de un estado concreto a otro, nunca «todos los manuales» a ciegas. El
 * diálogo pide primero un conteo (`dryRun`) y muestra el número antes de
 * confirmar; el pedido de cada envío sigue al envío.
 */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Datos no válidos.");
    const { fromStatus, toStatus, includeClosed, correction, dryRun } = parsed.data;

    if (fromStatus === toStatus) throw ErrorFactory.InvalidRequest("El estado nuevo debe ser distinto del actual.");
    if (!includeClosed && CLOSED_SHIPMENT_STATUSES.includes(fromStatus)) {
      throw ErrorFactory.InvalidRequest("Los envíos entregados o cancelados solo se corrigen marcando «incluir entregados y cancelados».");
    }
    if (!correction && !isShipmentTransitionAllowed(fromStatus, toStatus)) {
      throw ErrorFactory.InvalidRequest(
        `Un envío en ese estado no pasa a «${toStatus}» en el flujo normal. Márcalo como corrección si de verdad hace falta.`,
      );
    }

    const targets = await prismadb.shipping.findMany({
      where: { storeId: params.storeId, provider: ShippingProvider.MANUAL, status: fromStatus },
      select: { id: true },
    });

    if (dryRun) {
      return NextResponse.json({ count: targets.length, updated: 0, ordersUpdated: 0 }, { headers: CACHE_HEADERS.NO_CACHE });
    }

    let updated = 0;
    let ordersUpdated = 0;
    await prismadb.$transaction(async (tx) => {
      for (const target of targets) {
        const result = await applyShipmentStatus(tx, { shippingId: target.id, storeId: params.storeId, status: toStatus });
        if (result?.shipmentChanged) updated += 1;
        if (result?.orderChanged) ordersUpdated += 1;
      }
    });

    return NextResponse.json({ count: targets.length, updated, ordersUpdated }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SHIPMENT_BULK_MANUAL_UPDATE");
  }
}
