import prismadb from '@/lib/prismadb'
import { format } from 'date-fns'
import { ReviewsClient } from './components/client'
import { ReviewsColumn } from './components/columns'

export default async function ReviewsPage({
  params
}: {
  params: {
    storeId: string
  }
}) {
  const reviews = await prismadb.review.findMany({
    where: {
      storeId: params.storeId
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  const formattedReviews: ReviewsColumn[] = reviews.map((review) => ({
    id: review.id,
    productId: review.productId,
    userId: review.userId,
    name: review.name,
    rating: String(review.rating),
    comment: review.comment,
    createdAt: format(review.createdAt, 'MMMM d, yyyy')
  }))

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ReviewsClient data={formattedReviews} />
      </div>
    </div>
  )
}
