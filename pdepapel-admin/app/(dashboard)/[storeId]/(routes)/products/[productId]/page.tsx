import prismadb from '@/lib/prismadb'
import { format } from 'date-fns'
import { ReviewColumn } from './components/columns'
import { ProductForm } from './components/product-form'

export default async function ProductPage({
  params
}: {
  params: { productId: string; storeId: string }
}) {
  const product = await prismadb.product.findUnique({
    where: {
      id: params.productId
    },
    include: {
      images: true,
      reviews: true
    }
  })
  const categories = await prismadb.category.findMany({
    where: {
      storeId: params.storeId
    },
    include: {
      type: true
    }
  })
  const sizes = await prismadb.size.findMany({
    where: {
      storeId: params.storeId
    }
  })
  const colors = await prismadb.color.findMany({
    where: {
      storeId: params.storeId
    }
  })
  const designs = await prismadb.design.findMany({
    where: {
      storeId: params.storeId
    }
  })

  const formattedReviews: ReviewColumn[] =
    product?.reviews.map((review) => ({
      id: review.id,
      productId: review.productId,
      userId: review.userId,
      rating: String(review.rating),
      comment: review.comment || '',
      createdAt: format(product.createdAt, 'MMMM d, yyyy')
    })) || []

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ProductForm
          categories={categories}
          sizes={sizes}
          colors={colors}
          designs={designs}
          initialData={product}
          reviews={formattedReviews}
        />
      </div>
    </div>
  )
}
