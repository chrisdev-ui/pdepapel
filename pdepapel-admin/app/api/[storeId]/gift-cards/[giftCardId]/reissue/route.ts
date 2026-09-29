import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { deliverGiftCard } from "@/lib/gift-card-delivery";
import { reissueGiftCard } from "@/lib/gift-cards";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * «Reenviar correo»: código nuevo para el mismo saldo. El anterior deja de
 * valer en la misma transacción. La respuesta nunca trae el código: sale
 * por correo a quien recibe la tarjeta (o a quien la compró).
 */
export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; giftCardId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const issued = await reissueGiftCard(prismadb, {
      storeId: params.storeId,
      giftCardId: params.giftCardId,
      createdBy: userId,
    });
    const buyer = await prismadb.order.findUnique({
      where: { id: issued.card.purchaseOrderId },
      select: { fullName: true },
    });
    const delivered = await deliverGiftCard(issued, {
      buyerName: buyer?.fullName ?? null,
      reissued: true,
    });
    return NextResponse.json(
      {
        codeLast4: issued.card.codeLast4,
        deliveredTo: issued.deliverTo,
        delivered,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_REISSUE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404, 409],
    });
  }
}
