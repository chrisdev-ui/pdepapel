'use client'

import { Badge } from '@/components/ui/badge'
import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'

export type ProductColumn = {
  id: string
  sku: string
  name: string
  price: string
  size: string
  category: string
  color: string
  stock: string
  design: string
  isFeatured: boolean
  isArchived: boolean
  createdAt: string
}

export const columns: ColumnDef<ProductColumn>[] = [
  {
    accessorKey: 'sku',
    header: 'SKU'
  },
  {
    accessorKey: 'name',
    header: 'Nombre'
  },
  {
    accessorKey: 'price',
    header: 'Precio'
  },
  {
    accessorKey: 'category',
    header: 'Categoría'
  },
  {
    accessorKey: 'size',
    header: 'Tamaño'
  },
  {
    accessorKey: 'color',
    header: 'Color',
    cell: ({ row }) => (
      <div className="flex items-center gap-x-2">
        {row.original.color}
        <div
          className="h-6 w-6 rounded-full border"
          style={{ backgroundColor: row.original.color }}
        ></div>
      </div>
    )
  },
  {
    accessorKey: 'stock',
    header: 'Cantidad'
  },
  {
    accessorKey: 'design',
    header: 'Diseño'
  },
  {
    accessorKey: 'isArchived',
    header: 'Archivado',
    cell: ({ row }) => (
      <Badge variant={row.original.isArchived ? 'destructive' : 'success'}>
        {row.original.isArchived ? 'Sí' : 'No'}
      </Badge>
    )
  },
  {
    accessorKey: 'isFeatured',
    header: 'Destacado',
    cell: ({ row }) => (
      <Badge variant={row.original.isFeatured ? 'success' : 'outline'}>
        {row.original.isFeatured ? 'Sí' : 'No'}
      </Badge>
    )
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
