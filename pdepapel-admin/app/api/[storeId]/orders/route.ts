import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const { userId } = auth()
    const body = await req.json()
    const { phone, address, isPaid, isDelivered, orderItems: productIds } = body
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (!phone)
      return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
    if (!address)
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      )
    if (!productIds)
      return NextResponse.json(
        { error: 'Order items are required' },
        { status: 400 }
      )
    if (!params.storeId)
      return NextResponse.json(
        { error: 'Store ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const order = await prismadb.order.create({
      data: {
        phone,
        address,
        isDelivered,
        isPaid,
        orderItems: {
          create: productIds.map((productId: string) => ({
            product: { connect: { id: productId } }
          }))
        },
        storeId: params.storeId
      }
    })
    return NextResponse.json(order)
  } catch (error) {
    console.log('[ORDERS_POST]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    if (!params.storeId)
      return NextResponse.json(
        { error: 'Store ID is required' },
        { status: 400 }
      )
    const orders = await prismadb.order.findMany({
      where: { storeId: params.storeId }
    })
    return NextResponse.json(orders)
  } catch (error) {
    console.log('[SIZES_GET]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
