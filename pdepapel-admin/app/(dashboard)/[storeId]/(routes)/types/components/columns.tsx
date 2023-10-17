'use client'

import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'

export type TypeColumn = {
  id: string
  name: string
  createdAt: string
}

export const columns: ColumnDef<TypeColumn>[] = [
  {
    accessorKey: 'name',
    header: 'Nombre'
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
