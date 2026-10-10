"use client";

import axios from "axios";
import { CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { BoldText } from "../../components/bold-text";

export interface KnowledgeNoteItem {
  id: string;
  titulo: string;
  tema: string;
  body: string;
  approved: boolean;
  canApprove: boolean;
  /** Marca sin texto todavía: la escribe Paula. */
  pendingPaula: boolean;
}

const failure = (error: unknown) =>
  axios.isAxiosError(error) ? (error.response?.data?.error ?? "No se pudo guardar") : "No se pudo guardar";

function NoteCard({ storeId, initial }: { storeId: string; initial: KnowledgeNoteItem }) {
  const [note, setNote] = useState(initial);
  const [draft, setDraft] = useState(initial.pendingPaula ? "" : initial.body);
  const [editing, setEditing] = useState(initial.pendingPaula);
  const [saving, setSaving] = useState(false);
  const url = `/api/${storeId}/copiloto/conocimiento/${note.id}`;

  const call = async (request: () => Promise<{ data: KnowledgeNoteItem & { estado?: string; editedByPaula?: boolean } }>, ok: string) => {
    try {
      setSaving(true);
      const { data } = await request();
      setNote({ ...note, body: data.body, approved: data.approved, canApprove: data.canApprove, pendingPaula: false });
      setDraft(data.body);
      setEditing(false);
      toast({ description: ok, variant: "success" });
    } catch (error) {
      toast({ description: failure(error), variant: "warning" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <li id={note.id} className="scroll-mt-24 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-primary">{note.titulo}</h2>
          <p className="text-xs text-muted-foreground">
            {note.tema} · {note.id}
          </p>
        </div>
        <span className={cn("flex items-center gap-1 text-xs font-medium", note.approved ? "text-success" : "text-muted-foreground")}>
          {note.approved ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
          {note.approved ? "Aprobada: el copiloto la usa" : note.pendingPaula ? "Pendiente de Paula" : "Sin aprobar"}
        </span>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={`texto-${note.id}`} className="text-sm font-medium">
            Texto de la nota
          </label>
          <Textarea id={`texto-${note.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={8} maxLength={4000} disabled={saving} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={saving || !draft.trim()} onClick={() => call(() => axios.put(url, { body: draft }), "Texto guardado; falta aprobarlo")}>
              Guardar texto
            </Button>
            {!note.pendingPaula && (
              <Button type="button" variant="outline" disabled={saving} onClick={() => { setDraft(note.body); setEditing(false); }}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
            <BoldText text={note.body} />
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(true)}>
              Corregir
            </Button>
            {note.approved ? (
              <Button type="button" variant="outline" disabled={saving} onClick={() => call(() => axios.delete(url), "Aprobación retirada")}>
                Retirar aprobación
              </Button>
            ) : (
              <Button type="button" disabled={saving || !note.canApprove} onClick={() => call(() => axios.post(url), "Nota aprobada")}>
                Aprobar
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function KnowledgeList({ storeId, notes }: { storeId: string; notes: KnowledgeNoteItem[] }) {
  const approved = notes.filter((note) => note.approved).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {approved} de {notes.length} notas aprobadas.
      </p>
      <ul className="flex flex-col gap-3">
        {notes.map((note) => (
          <NoteCard key={note.id} storeId={storeId} initial={note} />
        ))}
      </ul>
    </div>
  );
}
