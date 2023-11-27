import { clerkClient } from '@clerk/nextjs'
import { OrderStatus, PaymentMethod } from '@prisma/client'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

import { env } from '@/lib/env.mjs'
import prismadb from '@/lib/prismadb'
import { stripe } from '@/lib/stripe'
import { generateOrderNumber } from '@/lib/utils'

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
    const { items, userId, guestId } = await req.json()

    let authenticatedUserId = null
    if (userId) {
      const user = await clerkClient.users.getUser(userId)
      if (user) {
        authenticatedUserId = user.id
      } else {
        return NextResponse.json(
          { error: 'Unauthenticated or invalid user' },
          { status: 401, headers: corsHeaders }
        )
      }
    }

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
          userId: authenticatedUserId,
          guestId: !authenticatedUserId ? guestId : null,
          orderNumber: generateOrderNumber(),
          status: OrderStatus.PENDING,
          orderItems: { create: orderItemsData },
          payment: {
            create: {
              storeId: params.storeId,
              method: PaymentMethod.Stripe
            }
          }
        }
      })
    ])

    const session = await stripe.checkout.sessions.create(
      {
        line_items,
        mode: 'payment',
        billing_address_collection: 'required',
        phone_number_collection: { enabled: true },
        success_url: `${env.FRONTEND_STORE_URL}/order/${order.id}/?success=1`,
        cancel_url: `${env.FRONTEND_STORE_URL}/order/${order.id}/?canceled=1`,
        metadata: { orderId: order.id }
      },
      { idempotencyKey: order.id }
    )

    return NextResponse.json({ url: session.url }, { headers: corsHeaders })
  } catch (error: any) {
    console.error('[ORDER_STRIPE_CHECKOUT]', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: `${
          error.raw.code === 'amount_too_small'
            ? 'El valor mínimo de compra con tarjeta es de al menos $5,000'
            : error.message
        }`
      },
      { status: 500, headers: corsHeaders }
    )
  }
}
