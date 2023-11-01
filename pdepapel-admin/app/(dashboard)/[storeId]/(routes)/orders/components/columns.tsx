'use client'

import { Badge } from '@/components/ui/badge'
import { OrderStatus, ShippingStatus } from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'
import { ProductList } from './product-list'

export type OrderColumn = {
  id: string
  orderNumber: string
  fullname: string
  phone: string
  address: string
  products: string[]
  totalPrice: string
  status: OrderStatus | undefined
  shippingStatus: ShippingStatus | undefined
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
    accessorKey: 'status',
    header: 'Estado de la orden',
    cell: ({ row }) => {
      const status = row.getValue('status') as OrderStatus | undefined
      if (!status) return null
      const variants: Record<
        OrderStatus,
        {
          variant: 'outline' | 'secondary' | 'success' | 'destructive'
          text: string
        }
      > = {
        [OrderStatus.PENDING]: { variant: 'outline', text: `⌛ Pendiente` },
        [OrderStatus.CREATED]: { variant: 'secondary', text: `📖 Creada` },
        [OrderStatus.PAID]: { variant: 'success', text: `💵 Pagada` },
        [OrderStatus.CANCELLED]: {
          variant: 'destructive',
          text: `🚫 Cancelada`
        }
      }
      return (
        <Badge variant={variants[status].variant} className="flex items-start">
          <span className="capitalize tracking-wide">
            {variants[status].text}
          </span>
        </Badge>
      )
    }
  },
  {
    accessorKey: 'shippingStatus',
    header: 'Estado del envío',
    cell: ({ row }) => {
      const status = row.getValue('shippingStatus') as
        | ShippingStatus
        | undefined
      if (!status) return null
      const variants: Record<
        ShippingStatus,
        {
          variant: 'outline' | 'secondary' | 'success' | 'destructive'
          text: string
        }
      > = {
        [ShippingStatus.Preparing]: {
          variant: 'outline',
          text: '📦 Preparando'
        },
        [ShippingStatus.Shipped]: {
          variant: 'secondary',
          text: '🚀 Despachada'
        },
        [ShippingStatus.InTransit]: {
          variant: 'secondary',
          text: '⛟ En tránsito'
        },
        [ShippingStatus.Delivered]: {
          variant: 'success',
          text: '🏠 Entregado'
        },
        [ShippingStatus.Returned]: {
          variant: 'destructive',
          text: '🚫 Retornado'
        }
      }
      return (
        <Badge
          variant={variants[status].variant}
          className="flex gap-1 items-start"
        >
          <span className="capitalize tracking-wide">
            {variants[status].text}
          </span>
        </Badge>
      )
    }
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
