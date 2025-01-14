"use client";

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
import { useTableStore } from "@/hooks/use-table-store";
import { useEffect, useState } from "react";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey: string;
  tableKey: string;
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
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    tableState.columnVisibility,
  );
  const [{ pageIndex, pageSize }, setPagination] = useState<{
    pageIndex: number;
    pageSize: number;
  }>(tableState.pagination);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
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
    <div>
      <div className="flex items-center py-4">
        <Input
          placeholder="Escribe para buscar..."
          value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn(searchKey)?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
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
                    <TableCell key={cell.id}>
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
      <div className="flex items-center justify-end space-x-2 py-4">
        <DataTablePagination table={table} />
      </div>
    </div>
  );
}
