"use client";

import axios from "axios";
import { Archive, ArchiveRestore, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { AttributeKind } from "@/lib/attribute-archive";

export interface AttributeCareCardProps {
  kind: AttributeKind;
  storeId: string;
  entity: { id: string; name: string; isArchived: boolean };
  /** Sustantivo con artículo para los diálogos: «la categoría», «el color». */
  noun: string;
  /** A dónde ir después de archivar, restaurar o eliminar. */
  hubHref: string;
  /** Con texto, Archivar queda deshabilitado y se explica el motivo. */
  archiveBlockedReason?: string | null;
  canDelete: boolean;
  /** Explicación honesta de qué pasa al eliminar (o por qué no se puede). */
  deleteDescription: string;
  deleteConfirmTitle: string;
  deleteConfirmDescription: string;
  onDelete: () => Promise<void>;
  disabled?: boolean;
}

const ARCHIVE_DESCRIPTION =
  "Deja de ofrecerse en los formularios y desaparece de los filtros y menús de la tienda. Los productos que ya lo usan no cambian y se siguen vendiendo. Se puede restaurar.";
const RESTORE_DESCRIPTION = "Vuelve a ofrecerse en los formularios y en la tienda en línea.";

/**
 * Tarjeta «Archivar o eliminar» de los formularios de atributos. Archivar es
 * la acción preferida (mismo endpoint que el centro de Atributos); eliminar
 * solo cuando no hay productos y siempre tras explicar el efecto.
 */
export function AttributeCareCard({
  kind,
  storeId,
  entity,
  noun,
  hubHref,
  archiveBlockedReason,
  canDelete,
  deleteDescription,
  deleteConfirmTitle,
  deleteConfirmDescription,
  onDelete,
  disabled,
}: AttributeCareCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = disabled || archiving || deleting;

  const toggleArchive = async () => {
    const archived = !entity.isArchived;
    const confirmed = await requestConfirmation({
      title: archived ? `¿Archivar ${noun} «${entity.name}»?` : `¿Restaurar ${noun} «${entity.name}»?`,
      description: archived ? ARCHIVE_DESCRIPTION : RESTORE_DESCRIPTION,
      confirmLabel: archived ? "Archivar" : "Restaurar",
    });
    if (!confirmed) return;
    try {
      setArchiving(true);
      const response = await axios.post<{ message: string }>(`/api/${storeId}/attributes/archive`, {
        kind,
        ids: [entity.id],
        archived,
      });
      toast({ description: response.data.message, variant: "success" });
      router.refresh();
      router.push(hubHref);
    } catch (error) {
      toast({
        title: archived ? "No se pudo archivar" : "No se pudo restaurar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setArchiving(false);
    }
  };

  const remove = async () => {
    const confirmed = await requestConfirmation({
      title: deleteConfirmTitle,
      description: deleteConfirmDescription,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setDeleting(true);
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SectionCard id="archivar-o-eliminar" title="Archivar o eliminar" tone="care" description={deleteDescription}>
      {confirmationDialog}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start"
          disabled={busy || Boolean(archiveBlockedReason && !entity.isArchived)}
          isLoading={archiving}
          loadingText={entity.isArchived ? "Restaurando…" : "Archivando…"}
          onClick={() => void toggleArchive()}
        >
          {entity.isArchived ? (
            <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />
          ) : (
            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {entity.isArchived ? "Restaurar" : "Archivar"}
        </Button>
        {archiveBlockedReason && !entity.isArchived && <p className="text-xs text-muted-foreground">{archiveBlockedReason}</p>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={busy || !canDelete}
          isLoading={deleting}
          loadingText="Eliminando…"
          onClick={() => void remove()}
        >
          <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
          Eliminar
        </Button>
      </div>
    </SectionCard>
  );
}
