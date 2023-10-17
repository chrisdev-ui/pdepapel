'use client'

import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'

export type CategoryColumn = {
  id: string
  name: string
  typeName: string
  createdAt: string
}

export const columns: ColumnDef<CategoryColumn>[] = [
  {
    accessorKey: 'name',
    header: 'Nombre'
  },
  {
    accessorKey: 'type',
    header: 'Tipo',
    cell: ({ row }) => row.original.typeName
  },
  {
    accessorKey: 'createdAt',
    header: 'Fecha de creación'
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
]
