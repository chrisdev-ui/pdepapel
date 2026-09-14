import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { canApproveBotReplies } from "@/lib/whatsapp/bot-approval";
import { parseBotReplyDraft } from "@/lib/whatsapp/bot-reply-assistant";
import { getBotReplies, getBotReply } from "../server/get-bot-replies";
import { BotReplyForm } from "./components/bot-reply-form";

const NEW_SEGMENTS = new Set(["nueva", "nuevo", "new"]);

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Respuesta automática | PdePapel Admin",
  description: "Editar lo que contesta el bot de WhatsApp",
};

export default async function BotReplyPage({
  params,
  searchParams,
}: {
  params: { storeId: string; botReplyId: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const isNew = NEW_SEGMENTS.has(params.botReplyId);
  const reply = isNew ? null : await getBotReply(params.storeId, params.botReplyId);
  // Una respuesta de otra tienda o inexistente no debe abrir el formulario de «nueva».
  if (!isNew && !reply) notFound();

  // El asistente manda su propuesta por la URL; al editar nunca se pisa lo guardado.
  const draft = isNew ? parseBotReplyDraft(searchParams) : null;

  // Destinos posibles de un botón: cualquier otra respuesta de la tienda.
  // Una respuesta no puede apuntarse a sí misma.
  const { userId } = await auth();
  const canApprove = canApproveBotReplies(userId);

  const all = await getBotReplies(params.storeId);
  const targets = all
    .filter((candidate) => candidate.id !== reply?.id)
    .map((candidate) => ({ id: candidate.id, label: candidate.label }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <BotReplyForm
          initialData={reply}
          draft={draft}
          targets={targets}
          canApprove={canApprove}
          storeId={params.storeId}
        />
      </div>
    </div>
  );
}
