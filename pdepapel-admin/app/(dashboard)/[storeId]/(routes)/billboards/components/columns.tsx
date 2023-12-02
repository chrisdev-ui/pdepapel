'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'

export type BillboardColumn = {
  id: string
  label: string
  title?: string
  redirectUrl?: string
  createdAt: string
}

export const columns: ColumnDef<BillboardColumn>[] = [
  {
    accessorKey: 'label',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Título" />
    )
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Título" />
    )
  },
  {
    accessorKey: 'redirectUrl',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Link de redirección" />
    )
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    )
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
]
