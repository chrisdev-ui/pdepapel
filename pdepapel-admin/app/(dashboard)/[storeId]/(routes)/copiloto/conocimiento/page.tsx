import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isCopilotConfigured } from "@/lib/copiloto/config";
import { getKnowledgeNotes } from "@/lib/copiloto/knowledge";
import { requireStoreOwner } from "@/lib/store-access";

import { KnowledgeList } from "./components/knowledge-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conocimiento del copiloto | PdePapel Admin",
  description: "Las notas que el copiloto puede citar",
};

export default async function KnowledgePage({ params }: { params: { storeId: string } }) {
  if (!isCopilotConfigured()) notFound();
  await requireStoreOwner(params.storeId);
  const notes = await getKnowledgeNotes(params.storeId);
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">Conocimiento del copiloto</h1>
        <p className="text-sm text-muted-foreground">
          El copiloto solo cita las notas aprobadas. Corrige lo que no esté bien y aprueba; si cambias el texto, vuelve a aprobarlo.
        </p>
      </div>
      <KnowledgeList
        storeId={params.storeId}
        notes={notes.map((note) => ({
          id: note.id,
          titulo: note.titulo,
          tema: note.tema,
          body: note.body,
          approved: note.approved,
          canApprove: note.canApprove,
          pendingPaula: note.estado === "pendiente-de-paula" && !note.editedByPaula,
        }))}
      />
    </div>
  );
}
