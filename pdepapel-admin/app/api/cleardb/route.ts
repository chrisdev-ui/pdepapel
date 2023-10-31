import prismadb from '@/lib/prismadb'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    await prismadb.mainBanner.deleteMany()
    await prismadb.billboard.deleteMany()
    await prismadb.color.deleteMany()
    await prismadb.category.deleteMany()
    await prismadb.type.deleteMany()
    await prismadb.size.deleteMany()
    await prismadb.design.deleteMany()
    await prismadb.banner.deleteMany()
    await prismadb.review.deleteMany()
    await prismadb.product.deleteMany()
    await prismadb.orderItem.deleteMany()
    await prismadb.shipping.deleteMany()
    await prismadb.paymentDetails.deleteMany()
    await prismadb.order.deleteMany()
    await prismadb.image.deleteMany()
    await prismadb.store.deleteMany()

    return NextResponse.json({ message: 'Database cleared' }, { status: 200 })
  } catch (error) {
    console.log('[CLEAR_DB] Error: ' + error)
    return NextResponse.json(
      { message: 'Error clearing database' },
      { status: 500 }
    )
  }
}
