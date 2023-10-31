import { NextResponse } from 'next/server'
import Stripe from 'stripe'

import prismadb from '@/lib/prismadb'
import { stripe } from '@/lib/stripe'
import { generateOrderNumber } from '@/lib/utils'
import { auth } from '@clerk/nextjs'
import { OrderStatus } from '@prisma/client'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

type Item = {
  productId: string
  quantity: number
  price: number
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const { userId } = auth()
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    const { items }: { items: Item[] } = await req.json()
    if (!items || items.length === 0)
      return NextResponse.json(
        { error: 'Products are required' },
        { status: 400 }
      )

    const productIds = items.map((item: Item) => item.productId)
    const products = await prismadb.product.findMany({
      where: { id: { in: productIds } }
    })

    for (let item of items) {
      const product = products.find((p) => p.id === item.productId)
      if (!product) {
        return NextResponse.json(
          { error: `Product ${item.productId} not found` },
          { status: 404 }
        )
      }
      if (product.stock < item.quantity) {
        return NextResponse.json(
          { error: `Product ${item.productId} out of stock` },
          { status: 400 }
        )
      }
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = []

    products.forEach((product) => {
      const quantity =
        items.find((item: Item) => item.productId === product.id)?.quantity || 1
      line_items.push({
        quantity,
        price_data: {
          currency: 'COP',
          product_data: {
            name: product.name
          },
          unit_amount: Number(product.price) * 100
        }
      })
    })

    const [order] = await prismadb.$transaction([
      prismadb.order.create({
        data: {
          storeId: params.storeId,
          orderNumber: generateOrderNumber(),
          status: OrderStatus.PENDING,
          orderItems: {
            create: productIds.map((productId: string) => {
              const item = items.find(
                (item: Item) => item.productId === productId
              )
              const quantity = item?.quantity ?? 1
              return {
                product: { connect: { id: productId } },
                quantity
              }
            })
          }
        }
      })
    ])

    const idempotencyKey = order.id
    const session = await stripe.checkout.sessions.create(
      {
        line_items,
        mode: 'payment',
        billing_address_collection: 'required',
        phone_number_collection: { enabled: true },
        success_url: `${process.env.FRONTEND_STORE_URL}/cart?success=1`,
        cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?canceled=1`,
        metadata: { orderId: order.id }
      },
      { idempotencyKey }
    )

    return NextResponse.json({ url: session.url }, { headers: corsHeaders })
  } catch (error) {
    console.error('[ORDER_CHECKOUT]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
