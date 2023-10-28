import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    if (!params.orderId)
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      )

    const order = await prismadb.order.findUnique({
      where: { id: params.orderId }
    })
    return NextResponse.json(order)
  } catch (error) {
    console.log('[ORDER_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } }
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
    if (!params.orderId)
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    // Delete related order items first
    await prismadb.orderItem.deleteMany({
      where: { orderId: params.orderId }
    })
    const order = await prismadb.order.update({
      where: { id: params.orderId },
      data: {
        phone,
        address,
        isDelivered,
        isPaid,
        orderItems: {
          create: productIds.map((productId: string) => ({
            product: { connect: { id: productId } }
          }))
        }
      }
    })
    return NextResponse.json(order)
  } catch (error) {
    console.log('[ORDER_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; orderId: string } }
) {
  try {
    const { userId } = auth()
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    if (!params.orderId)
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const order = await prismadb.order.deleteMany({
      where: { id: params.orderId }
    })
    return NextResponse.json(order)
  } catch (error) {
    console.log('[ORDER_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
