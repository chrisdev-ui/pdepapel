"use client";

import { Merge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import type { MergeableKind } from "@/lib/attribute-merge";

import { MergeAttributesDialog, type MergeCandidate } from "./merge-dialog";

interface AttributeMergeCardProps {
  storeId: string;
  kind: MergeableKind;
  entity: { id: string; name: string; isArchived: boolean };
  /** Valores activos de la familia (el propio incluido). */
  candidates: MergeCandidate[];
  /** A dónde ir al terminar la unión. */
  hubHref: string;
  description: string;
  disabled?: boolean;
}

/**
 * Tarjeta «Unir con otro» de las fichas: la misma ventana que en la lista.
 * `openWith` (por ref de estado) permite que la pista de nombre parecido la
 * abra con el parecido ya elegido como destino.
 */
export function AttributeMergeCard({ storeId, kind, entity, candidates, hubHref, description, disabled }: AttributeMergeCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const others = candidates.filter((row) => row.id !== entity.id);
  if (entity.isArchived || others.length === 0) return null;

  return (
    <SectionCard id="unir" title="Unir con otro" description={description}>
      <Button type="button" variant="outline" size="sm" className="justify-start" disabled={disabled} onClick={() => setOpen(true)}>
        <Merge className="mr-2 h-4 w-4" aria-hidden="true" />
        Unir con…
      </Button>
      {open && (
        <MergeAttributesDialog
          storeId={storeId}
          kind={kind}
          selectedIds={[entity.id]}
          candidates={candidates}
          open
          onOpenChange={(next) => !next && setOpen(false)}
          onDone={() => {
            setOpen(false);
            router.push(hubHref);
            router.refresh();
          }}
        />
      )}
    </SectionCard>
  );
}
