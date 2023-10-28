'use client'

import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'
import { ProductList } from './product-list'

export type OrderColumn = {
  id: string
  orderNumber: string
  phone: string
  address: string
  isPaid: boolean
  isDelivered: boolean
  totalPrice: string
  products: string[]
  createdAt: string
}

export const columns: ColumnDef<OrderColumn>[] = [
  {
    accessorKey: 'orderNumber',
    header: 'Número de orden'
  },
  {
    accessorKey: 'products',
    header: 'Productos',
    cell: ({ row }) => <ProductList products={row.getValue('products')} />
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
    accessorKey: 'createdAt',
    header: 'Fecha de creación'
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
]
