"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
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
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { DataTableViewOptions } from "./data-table-view-options";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey: string;
  tableKey: Models;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  tableKey,
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
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    tableState.columnVisibility,
  );
  const [{ pageIndex, pageSize }, setPagination] = useState<{
    pageIndex: number;
    pageSize: number;
  }>(tableState.pagination);

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
    });
  }, [
    tableKey,
    pageIndex,
    pageSize,
    sorting,
    columnFilters,
    columnVisibility,
    updateTableState,
  ]);

  return (
    <div className="space-y-4">
      {/* Controls Section - Responsive */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Escribe para buscar..."
          value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn(searchKey)?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <div className="flex items-center gap-x-2">
          {/* Hide view options on mobile to save space */}
          <div className="hidden sm:block">
            <DataTableViewOptions table={table} model={tableKey} />
          </div>
          <DataTableActionOptions table={table} model={tableKey} />
        </div>
      </div>

      {/* Table Container - Responsive */}
      <div className="space-y-4">
        {/* Mobile Card View */}
        <div className="block sm:hidden">
          <div className="space-y-4">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    "rounded-lg border bg-card p-4 shadow-sm",
                    row.getIsSelected() && "ring-2 ring-ring ring-offset-2",
                  )}
                >
                  <div className="space-y-3">
                    {/* Selection checkbox */}
                    <div className="flex items-center justify-between">
                      <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Seleccionar fila"
                      />
                      {/* Actions on the right */}
                      {(() => {
                        const actionsCell = row
                          .getVisibleCells()
                          .find((cell) => cell.column.id === "actions");
                        return actionsCell ? (
                          <div>
                            {flexRender(
                              actionsCell.column.columnDef.cell,
                              actionsCell.getContext(),
                            )}
                          </div>
                        ) : null;
                      })()}
                    </div>

                    {/* Data fields */}
                    <div className="space-y-2">
                      {row
                        .getVisibleCells()
                        .filter(
                          (cell) =>
                            cell.column.id !== "select" &&
                            cell.column.id !== "actions",
                        )
                        .map((cell) => {
                          const column = cell.column;
                          const header = column.columnDef.header;
                          let headerText = "";

                          if (typeof header === "string") {
                            headerText = header;
                          } else if (typeof header === "function") {
                            // Try to extract title from DataTableColumnHeader
                            const headerElement = flexRender(
                              header,
                              cell.getContext(),
                            );
                            if (
                              React.isValidElement(headerElement) &&
                              headerElement.props.title
                            ) {
                              headerText = headerElement.props.title;
                            } else {
                              headerText = column.id;
                            }
                          } else {
                            headerText = column.id;
                          }

                          return (
                            <div
                              key={cell.id}
                              className="flex flex-col space-y-1"
                            >
                              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {headerText}
                              </span>
                              <div className="text-sm">
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border bg-card p-8 text-center">
                <p className="text-muted-foreground">No results.</p>
              </div>
            )}
          </div>
        </div>

        {/* Desktop/Tablet Table View */}
        <div className="hidden sm:block">
          <div className="w-full overflow-auto">
            <div className="rounded-md border">
              <div className="min-w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          return (
                            <TableHead
                              key={header.id}
                              colSpan={header.colSpan}
                              className="whitespace-nowrap px-3 py-3 text-xs font-medium sm:px-4 sm:text-sm"
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
                          className="hover:bg-muted/50"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              key={cell.id}
                              className="px-3 py-3 text-xs sm:px-4 sm:py-4 sm:text-sm"
                            >
                              <div className="lg:truncate-none max-w-[200px] truncate lg:max-w-none">
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={columns.length + 1} // +1 for select column
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
          </div>
        </div>
      </div>

      {/* Pagination - Always visible, responsive */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:space-y-0">
        <DataTablePagination table={table} />
      </div>
    </div>
  );
}
