import prismadb from '@/lib/prismadb'
import { generateOrderNumber } from '@/lib/utils'
import { auth, clerkClient } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const { userId: ownerId } = auth()
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  try {
    const body = await req.json()
    const {
      fullName,
      phone,
      address,
      orderItems,
      status,
      payment,
      shipping,
      userId
    } = body
    const user = await clerkClient.users.getUser(userId)
    if (!user || !ownerId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
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
    if (!orderItems || orderItems.length === 0)
      return NextResponse.json(
        { error: 'Order items are required' },
        { status: 400 }
      )
    const orderNumber = generateOrderNumber()
    const [order] = await prismadb.$transaction([
      prismadb.order.create({
        data: {
          storeId: params.storeId,
          userId: user.id ?? ownerId,
          orderNumber,
          fullName,
          phone,
          address,
          status,
          payment: {
            create: { ...payment, storeId: params.storeId }
          },
          shipping: {
            create: { ...shipping, storeId: params.storeId }
          },
          orderItems: {
            create: orderItems.map(
              (product: { productId: string; quantity: number }) => ({
                product: { connect: { id: product.productId } },
                quantity: product.quantity ?? 1
              })
            )
          }
        }
      })
    ])
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
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  try {
    const orders = await prismadb.order.findMany({
      where: { storeId: params.storeId },
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
    return NextResponse.json(orders)
  } catch (error) {
    console.log('[ORDERS_GET]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}