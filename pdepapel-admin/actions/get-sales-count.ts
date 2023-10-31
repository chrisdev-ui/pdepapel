import prismadb from '@/lib/prismadb'
import { OrderStatus } from '@prisma/client'

export const getSalesCount = async (storeId: string) => {
  const salesCount = await prismadb.order.count({
    where: {
      storeId,
      status: OrderStatus.PAID
    }
  })

  return salesCount
}
