"use client";

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { useFormContext } from "react-hook-form";

import type { OrderFormValues, OrderTypePreset } from "./schema";
import { SectionCard } from "./section-card";

// Tiptap solo se carga cuando se abre la página del pedido en el navegador.
const RichTextEditor = dynamic(() => import("@/components/editor/rich-text-editor").then((mod) => mod.RichTextEditor), {
  ssr: false,
  loading: () => <Skeleton className="h-28 w-full rounded-md" />,
});

interface NotesCardProps {
  preset: Pick<OrderTypePreset, "notesLabel" | "notesHint">;
}

export function NotesCard({ preset }: NotesCardProps) {
  const form = useFormContext<OrderFormValues>();
  return (
    <SectionCard id="notas" title="Notas" description="Lo que ve el cliente y lo que es solo del equipo.">
      <FormField
        control={form.control}
        name="adminNotes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{preset.notesLabel}</FormLabel>
            <FormControl>
              <RichTextEditor placeholder={preset.notesHint} value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormDescription>{preset.notesHint}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="internalNotes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Notas internas</FormLabel>
            <FormControl>
              <RichTextEditor placeholder="Solo para el equipo" value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormDescription>Nunca se muestran al cliente.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </SectionCard>
  );
}
