import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { canApproveBotReplies } from "@/lib/whatsapp/bot-approval";
import { ORDER_TEMPLATES_VERSION } from "@/lib/whatsapp/bot-order-request";

/**
 * Visto bueno a los textos de pedidos y envío (lib/whatsapp/bot-order-request.ts):
 * el «sí» a un producto que pasa el pedido a Paula y la respuesta sobre el valor
 * del envío. Grupo aparte, guardado en las columnas `botCasual*`, para que esto
 * siga apagado hasta que Paula lo apruebe sin tocar los demás grupos.
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
        botCasualApprovedAt: new Date(),
        botCasualApprovedBy: userId,
        botCasualVersion: ORDER_TEMPLATES_VERSION,
      },
      create: {
        storeId: params.storeId,
        botCasualApprovedAt: new Date(),
        botCasualApprovedBy: userId,
        botCasualVersion: ORDER_TEMPLATES_VERSION,
      },
      select: {
        botCasualApprovedAt: true,
        botCasualApprovedBy: true,
        botCasualVersion: true,
      },
    });

    return NextResponse.json(settings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_ORDERS_APPROVE_POST", {
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
        { botCasualApprovedAt: null, botCasualVersion: null },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    }

    const settings = await prismadb.storeSettings.update({
      where: { storeId: params.storeId },
      data: {
        botCasualApprovedAt: null,
        botCasualApprovedBy: null,
        botCasualVersion: null,
      },
      select: { botCasualApprovedAt: true, botCasualVersion: true },
    });

    return NextResponse.json(settings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_ORDERS_APPROVE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}
