'use client'

import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'

export type OrderColumn = {
  id: string
  phone: string
  address: string
  isPaid: boolean
  isDelivered: boolean
  totalPrice: string
  products: string
  createdAt: string
}

export const columns: ColumnDef<OrderColumn>[] = [
  {
    accessorKey: 'products',
    header: 'Productos'
  },
  {
    accessorKey: 'phone',
    header: 'Teléfono'
  },
  {
    accessorKey: 'address',
    header: 'Dirección'
  },
  {
    accessorKey: 'totalPrice',
    header: 'Precio Total'
  },
  {
    accessorKey: 'isPaid',
    header: 'Estado del pago'
  },
  {
    accessorKey: 'isDelivered',
    header: 'Estado de la entrega'
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
]
