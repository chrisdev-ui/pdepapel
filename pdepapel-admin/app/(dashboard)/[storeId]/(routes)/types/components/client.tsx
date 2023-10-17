'use client'

import { ApiList } from '@/components/ui/api-list'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { Heading } from '@/components/ui/heading'
import { Separator } from '@/components/ui/separator'
import { Plus } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { TypeColumn, columns } from './columns'

interface TypeClientProps {
  data: TypeColumn[]
}

export const TypeClient = ({ data }: TypeClientProps) => {
  const router = useRouter()
  const params = useParams()
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Tipos (${data.length})`}
          description="Maneja los tipos de productos para tu tienda"
        />
        <Button onClick={() => router.push(`/${params.storeId}/types/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Crear tipo
        </Button>
      </div>
      <Separator />
      <DataTable searchKey="name" columns={columns} data={data} />
      <Heading title="API" description="API calls para los tipos" />
      <Separator />
      <ApiList entityName="types" entityIdName="typeId" />
    </>
  )
}
