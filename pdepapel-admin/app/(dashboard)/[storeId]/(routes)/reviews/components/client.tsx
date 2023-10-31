import { DataTable } from '@/components/ui/data-table'
import { Heading } from '@/components/ui/heading'
import { Separator } from '@/components/ui/separator'
import { ReviewsColumn, columns } from './columns'

interface ReviewsClientProps {
  data: ReviewsColumn[]
}

export const ReviewsClient = ({ data }: ReviewsClientProps) => {
  return (
    <>
      <Heading
        title={`Reseñas (${data.length})`}
        description="Maneja las reseñas de los productos para tu tienda"
      />
      <Separator />
      <DataTable searchKey="userId" columns={columns} data={data} />
    </>
  )
}
