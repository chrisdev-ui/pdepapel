"use client";

import { AlertTriangle, Merge } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TintBadge } from "@/components/ui/tint-badge";
import { findSimilarTaxonomyNames, suggestedTaxonomyName, type TaxonomyEntity, TAXONOMY_LABELS } from "@/lib/taxonomy";

export interface NameHintSibling {
  id: string;
  name: string;
  usage: number;
}

interface AttributeNameHintsProps {
  name: string;
  siblings: readonly NameHintSibling[];
  currentId?: string | null;
  entity: TaxonomyEntity;
  hrefFor: (id: string) => string;
  /** Abre «Unir con…» con el parecido como destino; sin él solo se sugiere la lista. */
  onMerge?: (targetId: string) => void;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * Debajo del campo Nombre: cómo quedará al guardar, si ya existe (con enlace)
 * y si se parece a otro. La API sigue siendo la barrera; esto evita el 409
 * y muestra la unión cuando el nombre casi coincide.
 */
export function AttributeNameHints({ name, siblings, currentId, entity, hrefFor, onMerge }: AttributeNameHintsProps) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const label = TAXONOMY_LABELS[entity];
  const suggested = suggestedTaxonomyName(name);
  const similar = findSimilarTaxonomyNames(siblings, name, currentId);
  const twin = similar.find((item) => item.reason === "igual")?.row ?? null;
  const alike = twin ? null : (similar.find((item) => item.reason !== "igual")?.row ?? null);

  return (
    <div className="flex flex-col gap-2" data-testid="name-hints">
      {suggested !== trimmed && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
          <TintBadge label="Se guardará como" tone="slate" />
          <span className="font-semibold text-primary">{suggested}</span>
          <span className="text-muted-foreground">mayúscula inicial y un solo espacio</span>
        </p>
      )}
      {twin && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Ya existe {label.indefinite} {label.singular} {label.named} «{twin.name}» ({plural(twin.usage, "producto", "productos")}). No se puede repetir:{" "}
            <Link href={hrefFor(twin.id)} className="font-semibold underline underline-offset-2">
              ábrelo
            </Link>{" "}
            o cambia el nombre.
          </span>
        </p>
      )}
      {alike && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-tint-cream bg-tint-cream/40 px-3 py-2 text-xs">
          <TintBadge label="Parecido" tone="cream" />
          <span>
            Ya existe «
            <Link href={hrefFor(alike.id)} className="font-semibold underline underline-offset-2">
              {alike.name}
            </Link>
            » ({plural(alike.usage, "producto", "productos")}). {onMerge ? "Si es el mismo, únelos:" : "Si es el mismo, únelos desde la lista."}
          </span>
          {onMerge && (
            <Button type="button" variant="outline" size="xs" onClick={() => onMerge(alike.id)}>
              <Merge className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Unir con «{alike.name}»
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
