import { headers } from "next/headers";

import prismadb from "@/lib/prismadb";
import { requireStoreRead } from "@/lib/store-access";

/** Una tarjeta con su libro y los pedidos donde se usó. Sin el hash del código. */
export async function getGiftCard(storeId: string, giftCardId: string) {
  const access = await requireStoreRead(storeId);
  headers();
  const card = await prismadb.giftCard.findFirst({
    where: { id: giftCardId, storeId },
    select: {
      id: true,
      codeLast4: true,
      initialAmount: true,
      balance: true,
      status: true,
      buyerEmail: true,
      recipientName: true,
      recipientEmail: true,
      message: true,
      issuedAt: true,
      deliveredAt: true,
      expiresAt: true,
      purchaseOrder: {
        select: { id: true, orderNumber: true, fullName: true, status: true, paidAt: true, total: true },
      },
      movements: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          reason: true,
          orderId: true,
          createdBy: true,
          createdAt: true,
        },
      },
      redemptions: {
        select: { id: true, orderNumber: true, status: true, total: true, giftCardAmount: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!card) return null;
  const isViewer = access.role === "viewer";
  return {
    ...card,
    buyerEmail: isViewer ? null : card.buyerEmail,
    recipientEmail: isViewer ? null : card.recipientEmail,
    canWrite: !isViewer,
  };
}

export type GiftCardDetail = NonNullable<Awaited<ReturnType<typeof getGiftCard>>>;
