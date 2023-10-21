'use client'

import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'

export type BillboardColumn = {
  id: string
  label: string
  createdAt: string
}

export const columns: ColumnDef<BillboardColumn>[] = [
  {
    accessorKey: 'label',
    header: 'Mensaje para la publicación'
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
