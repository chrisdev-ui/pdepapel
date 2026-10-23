import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse, zodErrorToAppError } from "@/lib/api-errors";
import { readJsonBody } from "@/lib/request-body";
import { setEarlyAlertSwitch } from "@/lib/social/early-alert";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

const schema = z.object({ enabled: z.boolean() });

/** Pausa o reanuda la alerta temprana de la tienda (interruptor de emergencia). Solo la dueña. */
export async function PUT(request: Request, { params }: { params: { storeId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    const read = await readJsonBody(request, "SOCIAL_EARLY_ALERT_SWITCH");
    if (!read.ok) throw ErrorFactory.InvalidRequest("No llegó si pausar o reanudar la alerta. Vuelve a intentarlo.");
    const parsed = schema.safeParse(read.body);
    if (!parsed.success) throw zodErrorToAppError(parsed.error);
    await setEarlyAlertSwitch(params.storeId, parsed.data.enabled);
    return NextResponse.json({ enabled: parsed.data.enabled }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_EARLY_ALERT_SWITCH", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
