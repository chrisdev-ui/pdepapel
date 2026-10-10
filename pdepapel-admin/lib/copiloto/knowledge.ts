import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import prismadb from "@/lib/prismadb";

/**
 * Conocimiento del oficio que el copiloto puede citar. El borrador es un
 * archivo de content/copiloto/conocimiento; Paula lo corrige y lo aprueba en
 * «Conocimiento» (`AssistantKnowledgeNote`). Solo entra al prompt el texto
 * aprobado, y la aprobación va atada a la huella de ese texto.
 */
export const KNOWLEDGE_DIR = path.join(process.cwd(), "content", "copiloto", "conocimiento");
export const KNOWLEDGE_NOTE_MAX_CHARS = 4000;

export interface KnowledgeDraft {
  id: string;
  titulo: string;
  tema: string;
  /** `pendiente-de-paula`: no se puede aprobar hasta que ella escriba el texto. */
  estado: "borrador" | "pendiente-de-paula";
  body: string;
}

export function parseKnowledgeNote(raw: string): KnowledgeDraft | null {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, "\n"));
  if (!match) return null;
  const meta = Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => /^(\w+):\s*(.*)$/.exec(line))
      .filter((found): found is RegExpExecArray => Boolean(found))
      .map((found) => [found[1], found[2].trim()]),
  );
  if (!meta.id || !meta.titulo) return null;
  return {
    id: meta.id,
    titulo: meta.titulo,
    tema: meta.tema ?? "general",
    estado: meta.estado === "pendiente-de-paula" ? "pendiente-de-paula" : "borrador",
    body: match[2].trim(),
  };
}

let cachedDrafts: KnowledgeDraft[] | null = null;

/** Los borradores del repositorio, ordenados por id (el prompt los quiere fijos para la caché). */
export function readKnowledgeDrafts(dir = KNOWLEDGE_DIR): KnowledgeDraft[] {
  if (dir === KNOWLEDGE_DIR && cachedDrafts) return cachedDrafts;
  const drafts = readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => parseKnowledgeNote(readFileSync(path.join(dir, file), "utf8")))
    .filter((note): note is KnowledgeDraft => Boolean(note))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (dir === KNOWLEDGE_DIR) cachedDrafts = drafts;
  return drafts;
}

export const knowledgeHash = (body: string) => createHash("sha256").update(body.trim()).digest("hex").slice(0, 32);

export interface KnowledgeNoteView extends KnowledgeDraft {
  /** El texto vigente: el de Paula si lo editó, si no el borrador. */
  editedByPaula: boolean;
  approved: boolean;
  approvedAt: Date | null;
  canApprove: boolean;
}

export async function getKnowledgeNotes(storeId: string): Promise<KnowledgeNoteView[]> {
  const rows = await prismadb.assistantKnowledgeNote.findMany({
    where: { storeId },
    select: { noteId: true, body: true, approvedHash: true, approvedAt: true },
  });
  const byId = new Map(rows.map((row) => [row.noteId, row]));
  return readKnowledgeDrafts().map((draft) => {
    const row = byId.get(draft.id);
    const body = row?.body?.trim() || draft.body;
    const editedByPaula = Boolean(row?.body?.trim());
    const canApprove = draft.estado === "borrador" || editedByPaula;
    return {
      ...draft,
      body,
      editedByPaula,
      approved: canApprove && Boolean(row?.approvedHash) && row?.approvedHash === knowledgeHash(body),
      approvedAt: row?.approvedAt ?? null,
      canApprove,
    };
  });
}

/** Lo que entra al prompt: solo lo aprobado, en orden fijo. */
export async function getApprovedKnowledge(storeId: string) {
  return (await getKnowledgeNotes(storeId)).filter((note) => note.approved);
}

export function knowledgeDraftExists(noteId: string) {
  return readKnowledgeDrafts().some((draft) => draft.id === noteId);
}
