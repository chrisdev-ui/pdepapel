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

import { Checkbox } from "@/components/ui/checkbox";
import { DataTableActionOptions } from "@/components/ui/data-table-action-options";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
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
import { useEffect, useState } from "react";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";
import { DataTableViewOptions } from "./data-table-view-options";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey: string;
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
  // New opt-in controlled selection props
  rowSelection?: Record<string, boolean>;
  onRowSelectionChange?: (selection: Record<string, boolean>) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  tableKey,
  filters,
  onColumnFiltersChange: onColumnFiltersChangeProp,
  rowSelection: controlledRowSelection,
  onRowSelectionChange: controlledOnRowSelectionChange,
}: DataTableProps<TData, TValue>) {
  const { tables, updateTableState } = useTableStore();
  const tableState = tables[tableKey] || {
    pagination: { pageIndex: 0, pageSize: 10 },
    sorting: [],
    columnFilters: [],
    columnVisibility: {},
  };

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    tableState.columnFilters,
  );
  const [sorting, setSorting] = useState<SortingState>(tableState.sorting);
  const [internalRowSelection, setInternalRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    tableState.columnVisibility,
  );
  const [{ pageIndex, pageSize }, setPagination] = useState<{
    pageIndex: number;
    pageSize: number;
  }>(tableState.pagination);

  const rowSelection = controlledRowSelection ?? internalRowSelection;

  const setRowSelection: OnChangeFn<RowSelectionState> = (updaterOrValue) => {
    let newSelection;
    if (typeof updaterOrValue === "function") {
      // @ts-ignore - The types form TanStack are a bit tricky to satisfy directly with our wrapper approach without generics, casting simplified
      newSelection = updaterOrValue(rowSelection);
    } else {
      newSelection = updaterOrValue;
    }

    if (controlledOnRowSelectionChange) {
      controlledOnRowSelectionChange(newSelection);
    } else {
      setInternalRowSelection(newSelection);
    }
  };

  const table = useReactTable({
    data,
    columns: [
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
      },
      ...columns,
    ],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
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
      columnVisibility,
      rowSelection,
      pagination: { pageIndex, pageSize },
    },
    onPaginationChange: setPagination,
  });

  useEffect(() => {
    updateTableState(tableKey, {
      pagination: { pageIndex, pageSize },
      sorting,
      columnFilters,
      columnVisibility,
      // We don't persist rowSelection in global store usually, as it's ephemeral
    });
    // Notify parent of filter changes
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

  return (
    <div>
      {/* Responsive Controls */}
      <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-[400px] items-center gap-x-2">
          <Input
            placeholder="Escribe para buscar..."
            value={
              (table.getColumn(searchKey)?.getFilterValue() as string) ?? ""
            }
            onChange={(event) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
            className="max-w-md"
          />
          {filters &&
            filters.map(
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
        </div>
        <div className="flex items-center gap-x-2">
          {/* Hide DataTableViewOptions on mobile */}
          <div className="hidden sm:block">
            <DataTableViewOptions table={table} model={tableKey} />
          </div>
          <DataTableActionOptions table={table} model={tableKey} />
        </div>
      </div>

      {/* Responsive Table Container */}
      <div className="w-full overflow-auto">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        key={header.id}
                        colSpan={header.colSpan}
                        className="whitespace-nowrap"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="whitespace-nowrap">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Responsive Pagination */}
      <div className="flex flex-col items-center justify-end gap-4 py-4 sm:flex-row sm:space-x-2">
        <DataTablePagination table={table} />
      </div>
    </div>
  );
}
