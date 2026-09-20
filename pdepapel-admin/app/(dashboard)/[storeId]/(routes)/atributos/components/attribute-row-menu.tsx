"use client";

import { useCanWrite } from "@/components/shell/viewer-access";
import axios from "axios";
import { Copy, Edit, ExternalLink, List, Merge, MoreHorizontal, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { ATTRIBUTE_KIND_LABELS, type AttributeKind } from "@/lib/attribute-archive";
import { MERGEABLE_KINDS, type MergeableKind } from "@/lib/attribute-merge";

import { ArchiveMenuItem } from "./archive-actions";
import { useAttributeActions } from "./attribute-actions";

interface AttributeRowMenuProps {
  kind: AttributeKind;
  row: { id: string; name: string; isArchived: boolean };
  /** Productos (o subcategorías, en categorías) que lo usan: bloquea Eliminar. */
  usage: number;
  editHref: string;
  /** «Ver sus 92 productos» / «Ver sus 7 subcategorías». */
  usageHref?: string | null;
  usageLabel?: string;
  storeHref?: string | null;
  /** Segmento de la API: colors, sizes, designs, categories, types. */
  apiModel: string;
  deleteTitle: string;
  deleteDescription: string;
  deleteBlockedReason: string;
  copiedMessage: string;
  deletedMessage: string;
}

/**
 * Menú de fila de las tablas de Atributos, en el orden de Productos: editar y
 * ver primero, «Unir con…», luego archivar y eliminar, y «Copiar ID» al final.
 */
export function AttributeRowMenu({
  kind,
  row,
  usage,
  editHref,
  usageHref,
  usageLabel,
  storeHref,
  apiModel,
  deleteTitle,
  deleteDescription,
  deleteBlockedReason,
  copiedMessage,
  deletedMessage,
}: AttributeRowMenuProps) {
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const router = useRouter();
  const actions = useAttributeActions();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const mergeable = (MERGEABLE_KINDS as readonly string[]).includes(kind) && actions && !row.isArchived;
  const storeId = actions?.storeId;

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId ?? editHref.split("/")[1]}/${apiModel}/${row.id}`);
      router.refresh();
      toast({ description: deletedMessage, variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <AlertModal isOpen={open} onClose={() => setOpen(false)} onConfirm={onDelete} loading={loading} title={deleteTitle} description={deleteDescription} confirmLabel="Sí, eliminar" destructive />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" aria-label={`Abrir menú de ${row.name}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="truncate">{row.name}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push(editHref)}>
            <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
            {canWrite ? "Editar" : "Ver"}
          </DropdownMenuItem>
          {usageHref && usage > 0 && (
            <DropdownMenuItem onClick={() => router.push(usageHref)}>
              <List className="mr-2 h-4 w-4" aria-hidden="true" />
              {usageLabel ?? "Ver sus productos"}
            </DropdownMenuItem>
          )}
          {storeHref && !row.isArchived && (
            <DropdownMenuItem asChild>
              <a href={storeHref} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                Ver en la tienda
              </a>
            </DropdownMenuItem>
          )}
          {canWrite && mergeable && (
            <DropdownMenuItem onClick={() => actions.openMerge(kind as MergeableKind, [row.id])}>
              <Merge className="mr-2 h-4 w-4" aria-hidden="true" />
              Unir con…
            </DropdownMenuItem>
          )}
          {canWrite && <DropdownMenuSeparator />}
          {canWrite && <ArchiveMenuItem kind={kind} row={row} />}
          {canWrite && (
          <DropdownMenuItem onClick={() => setOpen(true)} disabled={usage > 0} title={usage > 0 ? deleteBlockedReason : undefined} className="text-destructive focus:text-destructive">
            <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
            {usage > 0 ? `Eliminar · ${usage === 1 ? `tiene 1 ${kind === "types" ? "subcategoría" : "producto"}` : `tiene ${usage} ${kind === "types" ? "subcategorías" : "productos"}`}` : "Eliminar…"}
          </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              navigator.clipboard.writeText(row.id);
              toast({ description: copiedMessage, variant: "success" });
            }}
          >
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copiar ID
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Texto de bloqueo de Eliminar según la familia. */
export function deleteBlockedReasonFor(kind: AttributeKind): string {
  const label = ATTRIBUTE_KIND_LABELS[kind].singular;
  return kind === "types" ? `Tiene subcategorías; archiva la ${label} en su lugar` : `Tiene productos; archívalo en su lugar`;
}
