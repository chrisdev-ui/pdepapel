"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";

import { brandKey } from "@/lib/brand-rules";

interface AliasInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  /** El nombre de la marca: no se agrega como alias. */
  brandName: string;
  disabled?: boolean;
  describedBy?: string;
}

/** Etiquetas de alias: Enter (o coma) agrega, la ✕ quita. */
export function AliasInput({ value, onChange, brandName, disabled, describedBy }: AliasInputProps) {
  const [draft, setDraft] = useState("");
  const inputId = useId();

  const add = () => {
    const alias = draft.replace(/\s+/g, " ").trim();
    const key = brandKey(alias);
    if (!key || key === brandKey(brandName) || value.some((item) => brandKey(item) === key)) {
      setDraft("");
      return;
    }
    onChange([...value, alias]);
    setDraft("");
  };

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
      {value.map((alias) => (
        <span key={alias} className="inline-flex items-center gap-1 rounded-full bg-tint-lavender py-0.5 pl-3 pr-1 text-sm text-primary">
          {alias}
          <button
            type="button"
            disabled={disabled}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Quitar el alias ${alias}`}
            onClick={() => onChange(value.filter((item) => item !== alias))}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <label htmlFor={inputId} className="sr-only">
        Agregar alias
      </label>
      <input
        id={inputId}
        value={draft}
        disabled={disabled}
        maxLength={120}
        aria-describedby={describedBy}
        placeholder="Agregar alias y Enter"
        className="min-h-9 min-w-[10rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add();
          } else if (event.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
      />
    </div>
  );
}
