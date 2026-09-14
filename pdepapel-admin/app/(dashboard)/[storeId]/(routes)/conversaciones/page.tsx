import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getConversations } from "./server/get-conversations";

const ConversationClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Conversaciones | PdePapel Admin",
  description: "Conversaciones de WhatsApp con las clientas",
};

export default async function ConversationsPage({
  params,
}: {
  params: { storeId: string };
}) {
  const data = await getConversations(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <ConversationClient data={data} />
      </div>
    </div>
  );
}
