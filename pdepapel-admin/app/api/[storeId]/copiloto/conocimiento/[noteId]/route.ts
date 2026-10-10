import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getKnowledgeNotes, KNOWLEDGE_NOTE_MAX_CHARS, knowledgeDraftExists, knowledgeHash } from "@/lib/copiloto/knowledge";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

type Params = { params: { storeId: string; noteId: string } };

const editSchema = z.object({ body: z.string().trim().min(1).max(KNOWLEDGE_NOTE_MAX_CHARS) });

async function currentNote(storeId: string, noteId: string) {
  if (!knowledgeDraftExists(noteId)) throw ErrorFactory.NotFound("Nota no encontrada");
  const note = (await getKnowledgeNotes(storeId)).find((candidate) => candidate.id === noteId);
  if (!note) throw ErrorFactory.NotFound("Nota no encontrada");
  return note;
}

/** Paula corrige el texto. Editar retira la aprobación: la huella deja de coincidir. */
export async function PUT(request: Request, { params }: Params) {
  try {
    const userId = await requireStoreOwner(params.storeId);
    await currentNote(params.storeId, params.noteId);
    const parsed = editSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw ErrorFactory.InvalidRequest(`El texto debe tener entre 1 y ${KNOWLEDGE_NOTE_MAX_CHARS} caracteres`);
    await prismadb.assistantKnowledgeNote.upsert({
      where: { storeId_noteId: { storeId: params.storeId, noteId: params.noteId } },
      create: { storeId: params.storeId, noteId: params.noteId, body: parsed.data.body, updatedBy: userId },
      update: { body: parsed.data.body, updatedBy: userId },
    });
    return NextResponse.json(await currentNote(params.storeId, params.noteId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COPILOTO_CONOCIMIENTO_PUT", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

/** Aprueba el texto vigente. Una marca pendiente no se aprueba hasta que Paula escriba su texto. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const userId = await requireStoreOwner(params.storeId);
    const note = await currentNote(params.storeId, params.noteId);
    if (!note.canApprove) throw ErrorFactory.InvalidRequest("Primero escribe el texto de esta nota");
    await prismadb.assistantKnowledgeNote.upsert({
      where: { storeId_noteId: { storeId: params.storeId, noteId: params.noteId } },
      create: { storeId: params.storeId, noteId: params.noteId, approvedHash: knowledgeHash(note.body), approvedBy: userId, approvedAt: new Date() },
      update: { approvedHash: knowledgeHash(note.body), approvedBy: userId, approvedAt: new Date() },
    });
    return NextResponse.json(await currentNote(params.storeId, params.noteId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COPILOTO_CONOCIMIENTO_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

/** Retira la aprobación: la nota sale del prompt. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireStoreOwner(params.storeId);
    await currentNote(params.storeId, params.noteId);
    await prismadb.assistantKnowledgeNote.updateMany({
      where: { storeId: params.storeId, noteId: params.noteId },
      data: { approvedHash: null, approvedBy: null, approvedAt: null },
    });
    return NextResponse.json(await currentNote(params.storeId, params.noteId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "COPILOTO_CONOCIMIENTO_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
