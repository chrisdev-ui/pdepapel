import type { Metadata } from "next";
import { notFound } from "next/navigation";

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

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <ConversationThread conversation={conversation} storeId={params.storeId} />
      </div>
    </div>
  );
}
