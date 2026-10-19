import { headers } from "next/headers";

import prismadb from "@/lib/prismadb";
import { requireStoreRead } from "@/lib/store-access";
import { scrubGiftCard } from "@/lib/viewer-payloads";

/**
 * Las tarjetas de la tienda para la lista y los valores a la venta para el
 * panel de configuración. Nunca sale el hash del código: solo los últimos
 * cuatro caracteres.
 */
export async function getGiftCards(storeId: string) {
  const access = await requireStoreRead(storeId);
  headers();
  const [cards, denominations] = await Promise.all([
    prismadb.giftCard.findMany({
      where: { storeId },
      select: {
        id: true,
        codeLast4: true,
        initialAmount: true,
        balance: true,
        status: true,
        buyerEmail: true,
        recipientName: true,
        recipientEmail: true,
        issuedAt: true,
        deliveredAt: true,
        purchaseOrder: { select: { id: true, orderNumber: true, fullName: true } },
        _count: { select: { redemptions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prismadb.giftCardDenomination.findMany({
      where: { storeId },
      orderBy: [{ sortOrder: "asc" }, { amount: "asc" }],
    }),
  ]);
  const isViewer = access.role === "viewer";
  return {
    cards: cards.map(({ _count, ...card }) => ({
      // Solo lectura: sin quién compra ni para quién (ni nombres ni correos).
      ...(isViewer ? scrubGiftCard(card) : card),
      redemptions: _count.redemptions,
    })),
    denominations,
    canWrite: !isViewer,
  };
}

export type GiftCardRow = Awaited<ReturnType<typeof getGiftCards>>["cards"][number];
export type GiftCardDenominationRow = Awaited<ReturnType<typeof getGiftCards>>["denominations"][number];
