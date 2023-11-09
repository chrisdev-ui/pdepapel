import prismadb from '@/lib/prismadb'
import { generateOrderNumber } from '@/lib/utils'
import { clerkClient } from '@clerk/nextjs'
import { NextRequest, NextResponse } from 'next/server'

type OrderData = {
  storeId: string
  userId: string
  orderNumber: string
  fullName: string
  phone: string
  address: string
  orderItems: { create: any }
  status?: any
  payment?: { create: any }
  shipping?: { create: any }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  if (!params.storeId)
    return NextResponse.json(
      { error: 'Store ID is required' },
      { status: 400, headers: corsHeaders }
    )
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
    if (!user)
      return NextResponse.json(
        { error: 'Unauthenticated' },
        { status: 401, headers: corsHeaders }
      )
    if (!fullName)
      return NextResponse.json(
        { error: 'Full name is required' },
        { status: 400, headers: corsHeaders }
      )
    if (!phone)
      return NextResponse.json(
        { error: 'Phone is required' },
        { status: 400, headers: corsHeaders }
      )
    if (!address)
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400, headers: corsHeaders }
      )
    if (!orderItems || orderItems.length === 0)
      return NextResponse.json(
        { error: 'Order items are required' },
        { status: 400, headers: corsHeaders }
      )
    const orderNumber = generateOrderNumber()
    const orderData: OrderData = {
      storeId: params.storeId,
      userId: user.id,
      orderNumber,
      fullName,
      phone,
      address,
      orderItems: {
        create: orderItems.map(
          (product: { productId: string; quantity: number }) => ({
            product: { connect: { id: product.productId } },
            quantity: product.quantity ?? 1
          })
        )
      }
    }
    if (status) {
      orderData.status = status
    }
    if (payment) {
      orderData.payment = {
        create: { ...payment, storeId: params.storeId }
      }
    }
    if (shipping) {
      orderData.shipping = {
        create: { ...shipping, storeId: params.storeId }
      }
    }
    const [order] = await prismadb.$transaction([
      prismadb.order.create({
        data: orderData
      })
    ])
    return NextResponse.json(order, { headers: corsHeaders })
  } catch (error) {
    console.log('[ORDERS_POST]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } }
) {
  if (!params.storeId)
    return NextResponse.json(
      { error: 'Store ID is required' },
      { status: 400, headers: corsHeaders }
    )
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (userId) {
      const orders = await prismadb.order.findMany({
        where: { userId },
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
      return NextResponse.json(orders, { headers: corsHeaders })
    }
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
    return NextResponse.json(orders, { headers: corsHeaders })
  } catch (error) {
    console.log('[ORDERS_GET]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
