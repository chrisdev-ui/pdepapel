"use client";

import {
  BarChart3,
  ExternalLink,
  ImageIcon,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { canDeleteListingDraft } from "./listing-signals";
import type { Listing, ListingBusyState } from "./listing-types";

export type ListingRowHandlers = {
  onEdit: (listing: Listing) => void;
  onPublish: (listing: Listing) => void;
  onDeleteDraft: (listing: Listing) => void;
  onReviewContent: (listing: Listing) => void;
  onSyncContent: (listing: Listing) => void;
  onReviewQuality: (listing: Listing) => void;
  onPause: (listing: Listing) => void;
  onActivate: (listing: Listing) => void;
};

/**
 * Dos botones visibles (editar y publicar) y el resto en un menú: en la tabla
 * caben en una celda y en el celular no forman una torre de seis botones.
 */
export function ListingRowActions({
  listing,
  busy,
  handlers,
  className,
}: {
  listing: Listing;
  busy: ListingBusyState;
  handlers: ListingRowHandlers;
  className?: string;
}) {
  const isPublished = Boolean(listing.externalItemId);
  const isBusy =
    busy.publishingId === listing.id ||
    busy.deletingDraftId === listing.id ||
    busy.reviewingContentId === listing.id ||
    busy.syncingContentId === listing.id ||
    busy.loadingQualityId === listing.id ||
    busy.changingStatusId === listing.id;

  return (
    <div className={className} data-no-row-click>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => handlers.onEdit(listing)}
      >
        <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Editar
      </Button>
      {!isPublished ? (
        <Button
          type="button"
          size="xs"
          onClick={() => handlers.onPublish(listing)}
          isLoading={busy.publishingId === listing.id}
          loadingText="Publicando…"
          disabled={isBusy}
        >
          <UploadCloud className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Publicar
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={`Más acciones para ${listing.product.name}`}
            disabled={isBusy}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {listing.externalPermalink ? (
            <DropdownMenuItem asChild>
              <a href={listing.externalPermalink} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                Ver en Mercado Libre
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => handlers.onReviewContent(listing)}>
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            Revisar contenido
          </DropdownMenuItem>
          {isPublished ? (
            <>
              <DropdownMenuItem onSelect={() => handlers.onReviewQuality(listing)}>
                <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
                Revisar calidad
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handlers.onSyncContent(listing)}>
                <ImageIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                Sincronizar contenido
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {listing.status === "ACTIVE" ? (
                <DropdownMenuItem onSelect={() => handlers.onPause(listing)}>
                  <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
                  Pausar publicación
                </DropdownMenuItem>
              ) : null}
              {listing.status === "PAUSED" ? (
                <DropdownMenuItem onSelect={() => handlers.onActivate(listing)}>
                  <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                  Activar publicación
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
          {canDeleteListingDraft(listing) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => handlers.onDeleteDraft(listing)}
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Eliminar borrador
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
