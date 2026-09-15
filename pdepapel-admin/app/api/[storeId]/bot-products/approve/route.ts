import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { canApproveBotReplies } from "@/lib/whatsapp/bot-approval";
import { PRODUCT_TEMPLATES_VERSION } from "@/lib/whatsapp/bot-products";

/**
 * Visto bueno a los textos con los que el bot contesta sobre productos.
 *
 * Aparte del de los datos del negocio: si compartieran versión, publicar unos
 * textos nuevos retiraría sin querer la aprobación de los otros. Cada grupo se
 * aprueba y se retira por su cuenta, y editar un texto en el código invalida
 * solo el suyo.
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
        botProductsApprovedAt: new Date(),
        botProductsApprovedBy: userId,
        botProductsVersion: PRODUCT_TEMPLATES_VERSION,
      },
      create: {
        storeId: params.storeId,
        botProductsApprovedAt: new Date(),
        botProductsApprovedBy: userId,
        botProductsVersion: PRODUCT_TEMPLATES_VERSION,
      },
      select: {
        botProductsApprovedAt: true,
        botProductsApprovedBy: true,
        botProductsVersion: true,
      },
    });

    return NextResponse.json(settings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_PRODUCTS_APPROVE_POST", {
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
        { botProductsApprovedAt: null, botProductsVersion: null },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    }

    const settings = await prismadb.storeSettings.update({
      where: { storeId: params.storeId },
      data: {
        botProductsApprovedAt: null,
        botProductsApprovedBy: null,
        botProductsVersion: null,
      },
      select: { botProductsApprovedAt: true, botProductsVersion: true },
    });

    return NextResponse.json(settings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BOT_PRODUCTS_APPROVE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}
