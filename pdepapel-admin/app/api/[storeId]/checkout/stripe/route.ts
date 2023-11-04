import { NextResponse } from 'next/server'
import Stripe from 'stripe'

import prismadb from '@/lib/prismadb'
import { stripe } from '@/lib/stripe'
import { generateOrderNumber } from '@/lib/utils'
import { OrderStatus } from '@prisma/client'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  try {
    const { items } = await req.json()

    if (!items || items.length === 0)
      return NextResponse.json(
        { error: 'Products are required' },
        { status: 400, headers: corsHeaders }
      )

    const errors: string[] = []
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    const orderItemsData = []

    const productIds = items.map(
      (item: { productId: string }) => item.productId
    )
    const products = await prismadb.product.findMany({
      where: { id: { in: productIds } }
    })

    for (const { productId, quantity = 1 } of items) {
      const product = products.find((product) => product.id === productId)

      if (!product) {
        errors.push(`Product ${productId} not found`)
        continue
      }

      if (product.stock < quantity) {
        errors.push(`Product ${productId} out of stock`)
        continue
      }

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

      orderItemsData.push({
        product: { connect: { id: productId } },
        quantity
      })
    }

    if (errors.length > 0)
      return NextResponse.json(
        { errors },
        { status: 400, headers: corsHeaders }
      )

    const [order] = await prismadb.$transaction([
      prismadb.order.create({
        data: {
          storeId: params.storeId,
          userId: 'guest',
          orderNumber: generateOrderNumber(),
          status: OrderStatus.PENDING,
          orderItems: { create: orderItemsData }
        }
      })
    ])

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
      { idempotencyKey: order.id }
    )

    return NextResponse.json({ url: session.url }, { headers: corsHeaders })
  } catch (error) {
    console.error('[ORDER_CHECKOUT]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
