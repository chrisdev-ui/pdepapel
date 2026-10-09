import { auth } from "@clerk/nextjs/server";
import { GiftCardReview, OrderType } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { deliverGiftCard } from "@/lib/gift-card-delivery";
import { issueGiftCardForOrder } from "@/lib/gift-cards";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const DECISIONS = { approve: GiftCardReview.APPROVED, reject: GiftCardReview.REJECTED } as const;

/**
 * Decisión sobre una tarjeta de regalo pagada que quedó en revisión.
 * «Aprobar» emite el código y lo manda por correo; «Rechazar» no emite nada
 * (el reembolso, si el pago entró, se hace en la pasarela).
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json().catch(() => null);
    const decision = body?.decision as keyof typeof DECISIONS;
    if (!(decision in DECISIONS)) throw ErrorFactory.InvalidRequest("Decisión desconocida");

    const order = await prismadb.order.findFirst({
      where: { id: params.orderId, storeId: params.storeId },
      select: { id: true, type: true, giftCardReview: true, paidAt: true, fullName: true },
    });
    if (!order || order.type !== OrderType.GIFT_CARD) throw ErrorFactory.NotFound("No encontramos esa compra de tarjeta");
    if (order.giftCardReview !== GiftCardReview.PENDING) throw ErrorFactory.Conflict("Esta tarjeta ya no está en revisión. Recarga la página.");
    if (decision === "approve" && !order.paidAt) throw ErrorFactory.Conflict("El pago de esta tarjeta todavía no está confirmado.");

    const issued = await prismadb.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, storeId: params.storeId, giftCardReview: GiftCardReview.PENDING },
        data: { giftCardReview: DECISIONS[decision] },
      });
      if (claimed.count !== 1) throw ErrorFactory.Conflict("Esta tarjeta ya no está en revisión. Recarga la página.");
      if (decision === "reject") return null;
      return issueGiftCardForOrder(tx, { storeId: params.storeId, orderId: order.id, createdBy: userId });
    });

    const delivered = issued ? await deliverGiftCard(issued, { buyerName: order.fullName }) : false;
    return NextResponse.json(
      { decision, delivered, ...(issued ? { codeLast4: issued.card.codeLast4 } : {}) },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_REVIEW", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
    });
  }
}
