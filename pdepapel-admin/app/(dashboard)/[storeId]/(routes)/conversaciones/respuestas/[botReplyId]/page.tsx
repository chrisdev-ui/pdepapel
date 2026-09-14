import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getBotReply } from "../server/get-bot-replies";
import { BotReplyForm } from "./components/bot-reply-form";

const NEW_SEGMENTS = new Set(["nueva", "nuevo", "new"]);

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Respuesta automática | PdePapel Admin",
  description: "Editar lo que contesta el bot de WhatsApp",
};

export default async function BotReplyPage({
  params,
}: {
  params: { storeId: string; botReplyId: string };
}) {
  const isNew = NEW_SEGMENTS.has(params.botReplyId);
  const reply = isNew ? null : await getBotReply(params.storeId, params.botReplyId);
  // Una respuesta de otra tienda o inexistente no debe abrir el formulario de «nueva».
  if (!isNew && !reply) notFound();

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <BotReplyForm initialData={reply} storeId={params.storeId} />
      </div>
    </div>
  );
}
