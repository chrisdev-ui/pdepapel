import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { canApproveBotReplies } from "@/lib/whatsapp/bot-approval";
import { BUSINESS_FACT_TEMPLATES_VERSION } from "@/lib/whatsapp/bot-facts";

/**
 * Visto bueno a los textos con los que el bot da los datos del negocio.
 *
 * Como el menú de una respuesta: sin aprobar no sale nada. La diferencia es
 * que estos textos viven en el código, así que lo aprobado se guarda como una
 * versión; si alguien cambia una palabra, la versión cambia y el visto bueno
 * deja de valer solo, sin que nadie se acuerde de retirarlo.
 */

async function authorize(storeId: string) {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!storeId) throw ErrorFactory.MissingStoreId();
  await verifyStoreOwner(userId, storeId);
  if (!canApproveBotReplies(userId)) throw ErrorFactory.Unauthorized();
  return userId;
}

export async function POST(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const userId = await authorize(params.storeId);

    const settings = await prismadb.storeSettings.upsert({
      where: { storeId: params.storeId },
      update: {
        botFactsApprovedAt: new Date(),
        botFactsApprovedBy: userId,
        botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION,
      },
      create: {
        storeId: params.storeId,
        botFactsApprovedAt: new Date(),
        botFactsApprovedBy: userId,
        botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION,
      },
      select: {
        botFactsApprovedAt: true,
        botFactsApprovedBy: true,
        botFactsVersion: true,
      },
    });

    return NextResponse.json(settings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_FACTS_APPROVE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await authorize(params.storeId);

    const existing = await prismadb.storeSettings.findUnique({
      where: { storeId: params.storeId },
      select: { id: true },
    });
    // Sin fila no hay nada aprobado, que es justo lo que se quería dejar.
    if (!existing) {
      return NextResponse.json(
        { botFactsApprovedAt: null, botFactsVersion: null },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    }

    const settings = await prismadb.storeSettings.update({
      where: { storeId: params.storeId },
      data: {
        botFactsApprovedAt: null,
        botFactsApprovedBy: null,
        botFactsVersion: null,
      },
      select: { botFactsApprovedAt: true, botFactsVersion: true },
    });

    return NextResponse.json(settings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_FACTS_APPROVE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}
