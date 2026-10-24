"use client";

import axios from "axios";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { cleanTagLabel, mergeTags, missingTags, SOCIAL_TAG_KINDS, tagCount, tagKey, uniqueTags, type PostTags } from "@/lib/social/tags";

const KIND_LABEL = { FORMATO: "Formato", GANCHO: "Gancho" } as const;
const KIND_HINT = { FORMATO: "Qué tipo de pieza es.", GANCHO: "Con qué engancha en el primer segundo." } as const;

/** Formato y Gancho de una publicación: casillas con los valores de la tienda y «Agregar otra». */
export function PostTagEditor({ storeId, postId, initial, options, onSaved }: { storeId: string; postId: string; initial: PostTags; options: PostTags; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const id = useId();
  const [selected, setSelected] = useState<PostTags>(initial);
  const [extra, setExtra] = useState<PostTags>({ FORMATO: [], GANCHO: [] });
  const [draft, setDraft] = useState({ FORMATO: "", GANCHO: "" });
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [dirty, setDirty] = useState(false);
  // Si llegan etiquetas guardadas desde fuera (copiadas de la otra red), se suman sin tocar lo que aún no se guardó.
  const saved = useRef(initial);
  useEffect(() => {
    const added = missingTags(saved.current, initial);
    saved.current = initial;
    if (tagCount(added) > 0) setSelected((current) => mergeTags(current, added));
  }, [initial]);

  const isOn = (kind: keyof PostTags, label: string) => selected[kind].some((item) => tagKey(item) === tagKey(label));
  const toggle = (kind: keyof PostTags, label: string) => {
    setSelected((current) => ({
      ...current,
      [kind]: isOn(kind, label) ? current[kind].filter((item) => tagKey(item) !== tagKey(label)) : [...current[kind], label],
    }));
    setDirty(true);
  };
  const add = (kind: keyof PostTags) => {
    const label = cleanTagLabel(draft[kind]);
    if (!label) return;
    setExtra((current) => ({ ...current, [kind]: uniqueTags([...current[kind], label]) }));
    if (!isOn(kind, label)) toggle(kind, label);
    setDraft((current) => ({ ...current, [kind]: "" }));
  };
  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const { data } = await axios.put<{ tags: PostTags }>(`/api/${storeId}/social/posts/${postId}/tags`, selected);
      setSelected(data.tags);
      setDirty(false);
      toast({ title: "Etiquetas guardadas", description: "«Qué funciona» ya las cuenta." });
      await onSaved();
    } catch (error) {
      toast({ title: "No se pudieron guardar las etiquetas", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-lg border p-3">
      <h3 id={`${id}-title`} className="text-sm font-semibold text-primary">
        Etiquetas
      </h3>
      {SOCIAL_TAG_KINDS.map((kind) => {
        const labels = uniqueTags([...options[kind], ...extra[kind], ...selected[kind]]);
        return (
          <fieldset key={kind} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-primary">
              {KIND_LABEL[kind]} <span className="font-normal text-muted-foreground">· {KIND_HINT[kind]}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => (
                <label
                  key={label}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-3 text-sm text-primary has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={isOn(kind, label)} onChange={() => toggle(kind, label)} />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <label htmlFor={`${id}-${kind}`} className="sr-only">
                Agregar otra etiqueta de {KIND_LABEL[kind].toLowerCase()}
              </label>
              <Input
                id={`${id}-${kind}`}
                value={draft[kind]}
                maxLength={60}
                placeholder="Agregar otra"
                className="h-11 min-w-0 flex-1"
                onChange={(event) => setDraft((current) => ({ ...current, [kind]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    add(kind);
                  }
                }}
              />
              <Button type="button" variant="outline" className="h-11" onClick={() => add(kind)} disabled={!cleanTagLabel(draft[kind])}>
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                Agregar
              </Button>
            </div>
          </fieldset>
        );
      })}
      <Button type="button" className="h-11 self-start" onClick={save} disabled={saving || !dirty}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        Guardar etiquetas
      </Button>
    </section>
  );
}
