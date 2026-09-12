"use client";

import {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { Row, Table as ReactTable } from "@tanstack/react-table";
import { AlertTriangle, Inbox, RefreshCw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableActionOptions } from "@/components/ui/data-table-action-options";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Models } from "@/constants";
import { useTableStore } from "@/hooks/use-table-store";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";
import { DataTableViewOptions } from "./data-table-view-options";

export const DEFAULT_PAGE_SIZE = 25;

export interface DataTableEmptyState {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /**
   * Conservado por compatibilidad: la búsqueda ahora recorre todas las
   * columnas visibles. Se usa solo para nombrar el placeholder si no se pasa
   * `searchPlaceholder`.
   */
  searchKey?: string;
  searchPlaceholder?: string;
  tableKey: Models;
  filters?: {
    columnKey: string;
    title: string;
    options: {
      label: string;
      value: string;
      icon?: React.ComponentType<{ className?: string }>;
    }[];
  }[];
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void;
  /** Acciones para las filas seleccionadas; aparecen en la barra flotante. */
  bulkActions?: (table: ReactTable<TData>) => React.ReactNode;
  rowSelection?: Record<string, boolean>;
  onRowSelectionChange?: (selection: Record<string, boolean>) => void;
  /** Muestra filas de esqueleto en lugar de datos. */
  isLoading?: boolean;
  /** Mensaje de error con botón para reintentar. */
  error?: string | null;
  onRetry?: () => void;
  /** Qué mostrar cuando la lista no tiene registros (sin filtros). */
  emptyState?: DataTableEmptyState;
  /** Clic en la fila (se ignoran clics sobre botones, enlaces y casillas). */
  onRowClick?: (row: TData) => void;
  /** Por debajo de `sm`, cada fila se pinta con esta tarjeta en vez de la tabla. */
  renderMobileCard?: (row: Row<TData>) => React.ReactNode;
  getRowId?: (row: TData, index: number) => string;
}

const INTERACTIVE_SELECTOR =
  "a, button, input, select, textarea, label, [role='checkbox'], [role='menuitem'], [role='button'], [data-no-row-click]";

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder,
  tableKey,
  filters,
  onColumnFiltersChange: onColumnFiltersChangeProp,
  bulkActions,
  rowSelection: controlledRowSelection,
  onRowSelectionChange: controlledOnRowSelectionChange,
  isLoading = false,
  error = null,
  onRetry,
  emptyState,
  onRowClick,
  renderMobileCard,
  getRowId,
}: DataTableProps<TData, TValue>) {
  const { tables, updateTableState } = useTableStore();
  const tableState = tables[tableKey] || {
    pagination: { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE },
    sorting: [],
    columnFilters: [],
    columnVisibility: {},
  };

  // Solo se restauran filtros que tengan un control visible; los que quedaron
  // guardados de versiones anteriores (búsqueda por columna) ocultarían filas
  // sin forma de quitarlos.
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => {
    const restorable = new Set((filters ?? []).map((filter) => filter.columnKey));
    return tableState.columnFilters.filter((filter) => restorable.has(filter.id));
  });
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>(tableState.sorting);
  const [internalRowSelection, setInternalRowSelection] =
    useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    tableState.columnVisibility,
  );
  const [{ pageIndex, pageSize }, setPagination] = useState<{
    pageIndex: number;
    pageSize: number;
  }>(tableState.pagination);

  const rowSelection = controlledRowSelection ?? internalRowSelection;

  const setRowSelection: OnChangeFn<RowSelectionState> = (updaterOrValue) => {
    const newSelection =
      typeof updaterOrValue === "function"
        ? updaterOrValue(rowSelection)
        : updaterOrValue;
    if (controlledOnRowSelectionChange) {
      controlledOnRowSelectionChange(newSelection);
    } else {
      setInternalRowSelection(newSelection);
    }
  };

  const allColumns = useMemo<ColumnDef<TData, TValue>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Seleccionar todas las filas"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Seleccionar fila"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        enableGlobalFilter: false,
      },
      ...columns,
    ],
    [columns],
  );

  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      rowSelection,
      pagination: { pageIndex, pageSize },
    },
    onPaginationChange: setPagination,
  });

  // La página recordada puede quedar fuera de rango cuando la lista cambia de
  // tamaño (otra vista, otro filtro): sin esto la tabla se ve vacía con un
  // «201–57 de 57». Se vuelve a la última página que sí existe.
  const pageCount = table.getPageCount();
  useEffect(() => {
    if (pageIndex > 0 && pageIndex >= pageCount) {
      setPagination((prev) => ({ ...prev, pageIndex: Math.max(0, pageCount - 1) }));
    }
  }, [pageIndex, pageCount]);

  useEffect(() => {
    updateTableState(tableKey, {
      pagination: { pageIndex, pageSize },
      sorting,
      columnFilters,
      columnVisibility,
    });
    onColumnFiltersChangeProp?.(columnFilters);
  }, [
    tableKey,
    pageIndex,
    pageSize,
    sorting,
    columnFilters,
    columnVisibility,
    updateTableState,
    onColumnFiltersChangeProp,
  ]);

  const hasActiveFilters = globalFilter.length > 0 || columnFilters.length > 0;
  const clearFilters = () => {
    setGlobalFilter("");
    table.resetColumnFilters();
  };

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const rows = table.getRowModel().rows;
  const placeholder =
    searchPlaceholder ??
    "Buscar en la lista…"; // el nombre técnico de la columna nunca se muestra

  const handleRowClick = (
    event: React.MouseEvent<HTMLTableRowElement>,
    row: Row<TData>,
  ) => {
    if (!onRowClick) return;
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTOR)) return;
    onRowClick(row.original);
  };

  const renderStateRow = (content: React.ReactNode) => (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={visibleColumnCount} className="p-0">
        <div
          className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
          role="status"
        >
          {content}
        </div>
      </TableCell>
    </TableRow>
  );

  const stateIcon = (Icon: typeof Inbox, tint: string) => (
    <span
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-xl text-primary",
        tint,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
      <TableRow key={`skeleton-${i}`} aria-hidden="true">
        {Array.from({ length: visibleColumnCount }).map((__, j) => (
          <TableCell key={j}>
            <Skeleton className={cn("h-4", j === 0 ? "w-4" : "w-3/4")} />
          </TableCell>
        ))}
      </TableRow>
    ));
  } else if (error) {
    body = renderStateRow(
      <>
        {stateIcon(AlertTriangle, "bg-tint-pink")}
        <p className="text-sm font-semibold">No pudimos cargar la lista</p>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </Button>
        )}
      </>,
    );
  } else if (rows.length === 0 && data.length === 0 && !hasActiveFilters) {
    body = renderStateRow(
      <>
        {stateIcon(Inbox, "bg-tint-lavender")}
        <p className="text-sm font-semibold">
          {emptyState?.title ?? "Aún no hay registros"}
        </p>
        {emptyState?.description && (
          <p className="max-w-sm text-sm text-muted-foreground">
            {emptyState.description}
          </p>
        )}
        {emptyState?.action}
      </>,
    );
  } else if (rows.length === 0) {
    body = renderStateRow(
      <>
        {stateIcon(Search, "bg-tint-sky")}
        <p className="text-sm font-semibold">
          {globalFilter
            ? `Nada coincide con “${globalFilter}”`
            : "Nada coincide con estos filtros"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Revisa la ortografía o quita filtros.
        </p>
        <Button variant="outline" size="sm" onClick={clearFilters}>
          <X className="h-4 w-4" aria-hidden="true" />
          Limpiar filtros
        </Button>
      </>,
    );
  } else {
    body = rows.map((row) => (
      <TableRow
        key={row.id}
        data-state={row.getIsSelected() && "selected"}
        onClick={(event) => handleRowClick(event, row)}
        onKeyDown={(event) => {
          if (!onRowClick) return;
          if (event.key === "Enter" && event.target === event.currentTarget) {
            onRowClick(row.original);
          }
        }}
        tabIndex={onRowClick ? 0 : undefined}
        className={cn(
          "group",
          onRowClick &&
            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className="whitespace-nowrap px-3 py-2.5">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  return (
    <div className="relative">
      {/* Barra de herramientas */}
      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label={placeholder}
              placeholder={placeholder}
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="bg-white pl-9"
            />
          </div>
          {filters?.map(
            (filter) =>
              table.getColumn(filter.columnKey) && (
                <DataTableFacetedFilter
                  key={filter.columnKey}
                  column={table.getColumn(filter.columnKey)}
                  title={filter.title}
                  options={filter.options}
                />
              ),
          )}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <DataTableViewOptions table={table} model={tableKey} />
          </div>
          {selectedCount === 0 &&
            (bulkActions ? (
              bulkActions(table)
            ) : (
              <DataTableActionOptions table={table} model={tableKey} />
            ))}
        </div>
      </div>

      {/* Tarjetas en móvil */}
      {renderMobileCard && !isLoading && !error && rows.length > 0 && (
        <div className="flex flex-col gap-3 sm:hidden">
          {rows.map((row) => (
            <div key={row.id}>{renderMobileCard(row)}</div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div
        className={cn(
          "w-full overflow-auto",
          renderMobileCard && !isLoading && !error && rows.length > 0
            ? "hidden sm:block"
            : "",
        )}
      >
        <div className="rounded-xl border bg-white">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className="whitespace-nowrap px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>{body}</TableBody>
          </Table>
        </div>
      </div>

      {/* Paginación */}
      {!error && (
        <div className="py-4">
          <DataTablePagination table={table} />
        </div>
      )}

      {/* Barra flotante de selección */}
      {selectedCount > 0 && (
        <div
          role="region"
          aria-label={`${selectedCount} filas seleccionadas`}
          className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full bg-primary py-2 pl-4 pr-2 text-sm text-primary-foreground shadow-xl"
        >
          <span className="font-semibold">
            {selectedCount} {selectedCount === 1 ? "seleccionado" : "seleccionados"}
          </span>
          <span className="h-5 w-px bg-white/20" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-1 [&_button]:border-white/30 [&_button]:bg-transparent [&_button]:text-primary-foreground [&_button]:shadow-none [&_button:hover]:bg-white/10 [&_button:hover]:text-primary-foreground">
            {bulkActions ? (
              bulkActions(table)
            ) : (
              <DataTableActionOptions table={table} model={tableKey} />
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
            aria-label="Quitar selección"
            onClick={() => table.resetRowSelection()}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
