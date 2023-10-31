import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } }
) {
  if (!params.orderId)
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
  try {
    const order = await prismadb.order.findUnique({
      where: { id: params.orderId },
      include: {
        orderItems: {
          include: {
            product: true
          }
        },
        payment: true,
        shipping: true
      }
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
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.orderId)
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
  try {
    const body = await req.json()
    const {
      fullName,
      phone,
      address,
      orderItems: productIds,
      status,
      payment,
      shipping
    } = body
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    if (!fullName)
      return NextResponse.json(
        { error: 'Full name is required' },
        { status: 400 }
      )
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
    const orderUpdateData = {
      fullName,
      phone,
      address,
      orderItems: {
        create: productIds.map((productId: string) => ({
          product: { connect: { id: productId } }
        }))
      },
      ...(status && { status })
    }

    if (payment && Object.keys(payment).length > 0) {
      orderUpdateData.payment = {
        update: payment
      }
    }

    if (shipping && Object.keys(shipping).length > 0) {
      orderUpdateData.shipping = {
        update: shipping
      }
    }
    // Delete related order items first
    const [_, order] = await prismadb.$transaction([
      prismadb.orderItem.deleteMany({
        where: { orderId: params.orderId }
      }),
      prismadb.order.update({
        where: { id: params.orderId },
        data: orderUpdateData
      })
    ])
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
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!params.orderId)
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const order = await prismadb.order.delete({
      where: { id: params.orderId }
    })
    return NextResponse.json(order)
  } catch (error) {
    console.log('[ORDER_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
