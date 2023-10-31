'use client'

import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'

export type ReviewsColumn = {
  id: string
  productId: string
  userId: string
  rating: string
  comment: string | null
  createdAt: string
}

export const columns: ColumnDef<ReviewsColumn>[] = [
  { accessorKey: 'productId', header: 'ID del producto' },
  { accessorKey: 'userId', header: 'ID del usuario' },
  { accessorKey: 'rating', header: 'Calificación' },
  { accessorKey: 'comment', header: 'Comentarios' },
  { accessorKey: 'createdAt', header: 'Fecha de creación' },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
]
