"use client";

import type { ColumnDef, Row, Table as ReactTable } from "@tanstack/react-table";
import { memo, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TintBadge } from "@/components/ui/tint-badge";
import { Models } from "@/constants";
import { getListingStatusMeta } from "@/lib/mercadolibre/listing-status";
import { cn } from "@/lib/utils";

import { ListingRowActions, type ListingRowHandlers } from "./listing-row-actions";
import { getListingSignals, getPublishedUnits, LISTING_STATUS_TONE } from "./listing-signals";
import {
  bulkActionLabels,
  currencyFormatter,
  MAX_BULK_LISTINGS,
  type BulkAction,
  type BulkOutcome,
  type Listing,
  type ListingBusyState,
} from "./listing-types";

export type ListingTableProps = {
  listings: Listing[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  rowSelection: Record<string, boolean>;
  onRowSelectionChange: (selection: Record<string, boolean>) => void;
  highlightedListingId: string | null;
  busy: ListingBusyState;
  bulkOutcome: BulkOutcome | null;
  isRunningBulkAction: boolean;
  onRunBulkAction: (action: BulkAction, listingIds: string[]) => void;
  handlers: ListingRowHandlers;
  /** El botón «Preparar publicación» para el estado vacío. */
  emptyAction?: React.ReactNode;
};

function ListingSignals({ listing, className }: { listing: Listing; className?: string }) {
  const signals = getListingSignals(listing);
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {signals.map((signal) => (
        <TintBadge
          key={signal.key}
          label={signal.label}
          tone={signal.tone}
          className={cn("text-[11px]", signal.detail && "cursor-help")}
        />
      ))}
    </div>
  );
}

function ListingOutcome({ outcome }: { outcome: BulkOutcome["byListingId"][string] | undefined }) {
  if (!outcome) return null;
  return (
    <p className={cn("text-xs", outcome.outcome === "queued" ? "text-success" : "text-warning")}>
      {outcome.outcome === "queued" ? "Programada en segundo plano." : outcome.reason}
    </p>
  );
}

function ListingBulkActionsBar({
  table,
  isRunning,
  onRun,
}: {
  table: ReactTable<Listing>;
  isRunning: boolean;
  onRun: (action: BulkAction, listingIds: string[]) => void;
}) {
  const [action, setAction] = useState<BulkAction>("sync_stock");
  const selectedIds = table.getFilteredSelectedRowModel().rows.map((row) => row.original.id);
  const overCap = selectedIds.length > MAX_BULK_LISTINGS;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={action} onValueChange={(value) => setAction(value as BulkAction)}>
        <SelectTrigger className="h-8 w-52 text-xs" aria-label="Acción masiva para las publicaciones seleccionadas">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {Object.entries(bulkActionLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={isRunning || overCap || selectedIds.length === 0}
        isLoading={isRunning}
        loadingText="Programando…"
        onClick={() => onRun(action, selectedIds)}
      >
        Aplicar de forma segura
      </Button>
      {overCap ? (
        <span className="text-xs" role="status">
          Máximo {MAX_BULK_LISTINGS} a la vez; quita {selectedIds.length - MAX_BULK_LISTINGS}.
        </span>
      ) : null}
    </div>
  );
}

function buildColumns({
  busy,
  bulkOutcome,
  handlers,
  highlightedListingId,
}: Pick<ListingTableProps, "busy" | "bulkOutcome" | "handlers" | "highlightedListingId">): ColumnDef<Listing>[] {
  return [
    {
      id: "publicacion",
      accessorFn: (row) =>
        [row.product.name, row.product.sku, row.externalItemId, row.metadata?.familyName]
          .filter(Boolean)
          .join(" "),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Publicación" />,
      cell: ({ row }) => {
        const listing = row.original;
        return (
          <div
            id={`mercadolibre-listing-${listing.id}`}
            className={cn(
              "flex min-w-0 max-w-[280px] flex-col gap-0.5 scroll-mt-24",
              listing.id === highlightedListingId && "rounded-md ring-2 ring-tint-lavender ring-offset-2",
            )}
          >
            <span className="truncate font-semibold text-primary" title={listing.product.name}>
              {listing.product.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              SKU {listing.product.sku || "—"}
              {listing.externalItemId ? ` · ${listing.externalItemId}` : " · Borrador"}
              {listing.product.category?.name ? ` · ${listing.product.category.name}` : ""}
            </span>
            {listing.lastError ? (
              <span className="text-xs text-destructive" title={listing.lastError}>
                {listing.lastError}
              </span>
            ) : null}
            <ListingOutcome outcome={bulkOutcome?.byListingId[listing.id]} />
          </div>
        );
      },
    },
    {
      id: "estado",
      accessorFn: (row) => getListingStatusMeta(row.status).label,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const meta = getListingStatusMeta(row.original.status);
        return <TintBadge label={meta.label} tone={LISTING_STATUS_TONE[row.original.status] ?? "slate"} />;
      },
      filterFn: (row, _id, value: string[]) =>
        value.length === 0 || value.includes(getListingStatusMeta(row.original.status).label),
    },
    {
      id: "precio",
      accessorFn: (row) => row.marketplacePrice ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Precio" />,
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">
            {row.original.marketplacePrice !== null
              ? currencyFormatter.format(row.original.marketplacePrice)
              : "—"}
          </span>
          <span className="text-xs text-muted-foreground">
            Tienda {currencyFormatter.format(row.original.product.price)}
          </span>
        </div>
      ),
    },
    {
      id: "stock",
      accessorFn: (row) => getPublishedUnits(row),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />,
      cell: ({ row }) => {
        const listing = row.original;
        const units = getPublishedUnits(listing);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{units} para publicar</span>
            <span className="text-xs text-muted-foreground">
              Local {listing.product.stock} · reserva {listing.stockSafetyBuffer}
              {listing.externalItemId && listing.lastSyncedStock !== null && listing.lastSyncedStock !== units
                ? ` · en Mercado Libre ${listing.lastSyncedStock}`
                : ""}
            </span>
          </div>
        );
      },
    },
    {
      id: "senales",
      enableSorting: false,
      header: () => <span>Señales</span>,
      cell: ({ row }) => <ListingSignals listing={row.original} className="max-w-[260px]" />,
    },
    {
      id: "acciones",
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <ListingRowActions
          listing={row.original}
          busy={busy}
          handlers={handlers}
          className="flex items-center justify-end gap-1"
        />
      ),
    },
  ];
}

function ListingMobileCard({
  row,
  busy,
  bulkOutcome,
  handlers,
  highlighted,
}: {
  row: Row<Listing>;
  busy: ListingBusyState;
  bulkOutcome: BulkOutcome | null;
  handlers: ListingRowHandlers;
  highlighted: boolean;
}) {
  const listing = row.original;
  const meta = getListingStatusMeta(listing.status);
  return (
    <article
      id={`mercadolibre-listing-${listing.id}`}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border bg-white p-3.5 shadow-sm scroll-mt-24",
        highlighted && "border-tint-lavender bg-tint-lavender/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-bold text-primary">{listing.product.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            SKU {listing.product.sku || "—"}
            {listing.externalItemId ? ` · ${listing.externalItemId}` : " · Borrador"}
          </span>
        </div>
        <TintBadge label={meta.label} tone={LISTING_STATUS_TONE[listing.status] ?? "slate"} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="block text-xs text-muted-foreground">Precio Mercado Libre</span>
          <span className="font-semibold">
            {listing.marketplacePrice !== null ? currencyFormatter.format(listing.marketplacePrice) : "—"}
          </span>
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">Stock para publicar</span>
          <span className="font-semibold">{getPublishedUnits(listing)}</span>
        </div>
      </div>
      <ListingSignals listing={listing} />
      {listing.lastError ? <p className="text-xs text-destructive">{listing.lastError}</p> : null}
      <ListingOutcome outcome={bulkOutcome?.byListingId[listing.id]} />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-primary"
            checked={row.getIsSelected()}
            onChange={(event) => row.toggleSelected(event.target.checked)}
            aria-label={`Seleccionar ${listing.product.name}`}
          />
          Seleccionar
        </label>
        <ListingRowActions
          listing={listing}
          busy={busy}
          handlers={handlers}
          className="flex items-center gap-1"
        />
      </div>
    </article>
  );
}

function ListingTableComponent({
  listings,
  isLoading,
  error,
  onRetry,
  rowSelection,
  onRowSelectionChange,
  highlightedListingId,
  busy,
  bulkOutcome,
  isRunningBulkAction,
  onRunBulkAction,
  handlers,
  emptyAction,
}: ListingTableProps) {
  const columns = useMemo(
    () => buildColumns({ busy, bulkOutcome, handlers, highlightedListingId }),
    [busy, bulkOutcome, handlers, highlightedListingId],
  );
  const statusOptions = useMemo(
    () =>
      Array.from(new Set(listings.map((listing) => getListingStatusMeta(listing.status).label))).map(
        (label) => ({ label, value: label }),
      ),
    [listings],
  );
  return (
    <DataTable
      tableKey={Models.MarketplaceListings}
      searchPlaceholder="Buscar por producto, SKU o id de Mercado Libre…"
      columns={columns}
      data={listings}
      getRowId={(row) => row.id}
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      filters={[{ columnKey: "estado", title: "Estado", options: statusOptions }]}
      bulkActions={(table) => (
        <ListingBulkActionsBar table={table} isRunning={isRunningBulkAction} onRun={onRunBulkAction} />
      )}
      renderMobileCard={(row) => (
        <ListingMobileCard
          row={row}
          busy={busy}
          bulkOutcome={bulkOutcome}
          handlers={handlers}
          highlighted={row.original.id === highlightedListingId}
        />
      )}
      emptyState={{
        title: "Aún no hay publicaciones preparadas",
        description: "Crea un borrador con el asistente o importa las publicaciones que ya existen en Mercado Libre.",
        action: emptyAction,
      }}
    />
  );
}

/** Memorizada: escribir en el asistente no vuelve a pintar la tabla. */
export const ListingTable = memo(ListingTableComponent);
