import prismadb from '@/lib/prismadb'
import { formatter } from '@/lib/utils'
import { format } from 'date-fns'
import { ProductClient } from './components/client'
import { ProductColumn } from './components/columns'

export default async function ProductsPage({
  params
}: {
  params: {
    storeId: string
  }
}) {
  const products = await prismadb.product.findMany({
    where: {
      storeId: params.storeId
    },
    include: {
      category: true,
      size: true,
      color: true,
      design: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  const formattedProducts: ProductColumn[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    isFeatured: product.isFeatured,
    isArchived: product.isArchived,
    stock: String(product.stock),
    price: formatter.format(product.price),
    category: product.category.name,
    size: product.size.name,
    color: product.color.value,
    design: product.design.name,
    createdAt: format(product.createdAt, 'MMMM d, yyyy')
  }))

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ProductClient data={formattedProducts} />
      </div>
    </div>
  )
}
