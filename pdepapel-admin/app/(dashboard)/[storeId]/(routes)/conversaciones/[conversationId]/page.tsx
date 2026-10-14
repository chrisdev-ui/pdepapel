import type { Metadata } from "next";
import { notFound } from "next/navigation";

import prismadb from "@/lib/prismadb";

import { ConversationThread } from "./components/conversation-thread";
import { getConversation } from "./server/get-conversation";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Conversación | PdePapel Admin",
  description: "Historial de una conversación de WhatsApp",
};

export default async function ConversationPage({
  params,
}: {
  params: { storeId: string; conversationId: string };
}) {
  const conversation = await getConversation(params.storeId, params.conversationId);
  // Una conversación de otra tienda o inexistente no debe abrirse.
  if (!conversation) notFound();
  const requestedIds = Array.from(new Set(conversation.messages.flatMap((message) => message.orderRequest?.items.map((item) => item.productId) ?? [])));
  const [store, requested] = await Promise.all([
    prismadb.store.findUnique({ where: { id: params.storeId }, select: { reservationDefaultDays: true } }),
    requestedIds.length > 0
      ? prismadb.product.findMany({ where: { storeId: params.storeId, id: { in: requestedIds } }, select: { id: true, stock: true, reservedUnits: true } })
      : Promise.resolve([]),
  ]);
  const productStock = Object.fromEntries(requested.map((row) => [row.id, { stock: row.stock, reservedUnits: row.reservedUnits }]));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <ConversationThread conversation={conversation} storeId={params.storeId} reservationDefaultDays={store?.reservationDefaultDays ?? 3} productStock={productStock} />
      </div>
    </div>
  );
}
