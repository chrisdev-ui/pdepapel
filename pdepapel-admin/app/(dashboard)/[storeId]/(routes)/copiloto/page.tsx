import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isCopilotConfigured } from "@/lib/copiloto/config";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

import { CopilotChat } from "./components/copilot-chat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Copiloto | PdePapel Admin",
  description: "Preguntas sobre el negocio y el oficio",
};

/** Solo la dueña, y solo con la conexión de solo lectura configurada. */
export default async function CopilotPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams: { desde?: string };
}) {
  if (!isCopilotConfigured()) notFound();
  const userId = await requireStoreOwner(params.storeId);
  const conversations = await prismadb.assistantConversation.findMany({
    where: { storeId: params.storeId, userId },
    orderBy: { lastMessageAt: "desc" },
    take: 30,
    select: { id: true, title: true, lastMessageAt: true },
  });

  return (
    <div className="flex flex-col gap-3 px-4 pb-2 pt-1 sm:p-8 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-primary sm:text-2xl">Copiloto</h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Pregunta por tus ventas, el inventario o dudas del oficio. Solo lee: no cambia nada.
          </p>
        </div>
        <Link href={`/${params.storeId}/copiloto/conocimiento`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Conocimiento
        </Link>
      </div>
      <CopilotChat
        storeId={params.storeId}
        screen={searchParams.desde?.slice(0, 200) ?? null}
        conversations={conversations.map((conversation) => ({
          ...conversation,
          lastMessageAt: conversation.lastMessageAt.toISOString(),
        }))}
      />
    </div>
  );
}
