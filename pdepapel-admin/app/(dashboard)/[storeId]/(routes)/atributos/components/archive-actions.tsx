"use client";

import type { Table } from "@tanstack/react-table";
import axios from "axios";
import { Archive, ArchiveRestore } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { ATTRIBUTE_KIND_LABELS, type AttributeKind } from "@/lib/attribute-archive";

import { TintBadge } from "../../pedidos/components/order-badges";

export interface ArchivableRow {
  id: string;
  isArchived: boolean;
}

/** Insignia Activo / Archivado para las tablas de Atributos. */
export function AttributeStatusBadge({ isArchived }: { isArchived: boolean }) {
  return isArchived ? <TintBadge label="Archivado" tone="slate" /> : <TintBadge label="Activo" tone="mint" />;
}

const ARCHIVE_COPY = {
  archive: {
    label: "Archivar",
    description:
      "Deja de ofrecerse en los formularios y desaparece de los filtros y menús de la tienda. Los productos que ya lo usan no cambian y se siguen vendiendo. Se puede restaurar.",
  },
  restore: {
    label: "Restaurar",
    description: "Vuelve a ofrecerse en los formularios y en la tienda en línea.",
  },
} as const;

/** Llama al endpoint de archivo y refresca la página; comparte toast y errores. */
export function useArchiveAttributes(kind: AttributeKind) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const run = async (ids: string[], archived: boolean, onDone?: () => void) => {
    try {
      setLoading(true);
      const response = await axios.post<{ message: string }>(`/api/${params.storeId}/attributes/archive`, {
        kind,
        ids,
        archived,
      });
      toast({ description: response.data.message, variant: "success" });
      onDone?.();
      router.refresh();
    } catch (error) {
      toast({
        title: archived ? "No se pudo archivar" : "No se pudo restaurar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return { run, loading };
}

/** Elementos «Archivar» / «Restaurar» para el menú de fila de cualquier atributo. */
export function ArchiveMenuItem({ kind, row }: { kind: AttributeKind; row: ArchivableRow }) {
  const { run, loading } = useArchiveAttributes(kind);
  return row.isArchived ? (
    <DropdownMenuItem disabled={loading} onClick={() => run([row.id], false)}>
      <ArchiveRestore className="mr-2 h-4 w-4" />
      Restaurar
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem disabled={loading} onClick={() => run([row.id], true)}>
      <Archive className="mr-2 h-4 w-4" />
      Archivar
    </DropdownMenuItem>
  );
}

/** Acciones en lote de una tabla de atributos: archivar o restaurar la selección. */
export function AttributeBulkActions<T extends ArchivableRow>({ kind, table }: { kind: AttributeKind; table: Table<T> }) {
  const { run, loading } = useArchiveAttributes(kind);
  const [pending, setPending] = useState<"archive" | "restore" | null>(null);
  const selected = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  if (selected.length === 0) return null;

  const labels = ATTRIBUTE_KIND_LABELS[kind];
  const noun = selected.length === 1 ? labels.singular : labels.plural;
  const targets = pending === "restore" ? selected.filter((row) => row.isArchived) : selected.filter((row) => !row.isArchived);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {selected.some((row) => !row.isArchived) && (
          <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => setPending("archive")}>
            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
            Archivar
          </Button>
        )}
        {selected.some((row) => row.isArchived) && (
          <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => setPending("restore")}>
            <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />
            Restaurar
          </Button>
        )}
      </div>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿{pending ? ARCHIVE_COPY[pending].label : ""} {targets.length} {targets.length === 1 ? labels.singular : labels.plural}?
            </AlertDialogTitle>
            <AlertDialogDescription>{pending ? ARCHIVE_COPY[pending].description : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading || targets.length === 0}
              onClick={(event) => {
                event.preventDefault();
                void run(
                  targets.map((row) => row.id),
                  pending === "archive",
                  () => {
                    table.resetRowSelection();
                    setPending(null);
                  },
                ).then(() => setPending(null));
              }}
            >
              {loading ? "Aplicando…" : `Sí, ${pending ? ARCHIVE_COPY[pending].label.toLowerCase() : ""} ${noun}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
