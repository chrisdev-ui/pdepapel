'use client'

import { DataTable } from '@/components/ui/data-table'
import { Heading } from '@/components/ui/heading'
import { Separator } from '@/components/ui/separator'
import { OrderColumn, columns } from './columns'

interface OrderClientProps {
  data: OrderColumn[]
}

export const OrderClient = ({ data }: OrderClientProps) => {
  return (
    <>
      <Heading
        title={`Órdenes (${data.length})`}
        description="Maneja las órdenes de tu tienda"
      />
      <Separator />
      <DataTable searchKey="products" columns={columns} data={data} />
    </>
  )
}
