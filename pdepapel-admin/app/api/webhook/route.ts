import { env } from '@/lib/env.mjs'
import prismadb from '@/lib/prismadb'
import { stripe } from '@/lib/stripe'
import { OrderStatus, PaymentMethod, ShippingStatus } from '@prisma/client'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST(req: Request) {
  const body = await req.text()
  const signature = headers().get('Stripe-Signature') as string

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: `Webhook Error: ${error.message}` },
      { status: 400 }
    )
  }

  const session = event.data.object as Stripe.Checkout.Session
  const address = session?.customer_details?.address

  const addressComponents = [
    address?.line1,
    address?.line2,
    address?.city,
    address?.state,
    address?.postal_code,
    address?.country
  ]

  const addressString = addressComponents.filter((a) => a !== null).join(', ')

  if (event.type === 'checkout.session.completed') {
    const existingOrder = await prismadb.order.findUnique({
      where: {
        id: session?.metadata?.orderId
      },
      include: {
        orderItems: true
      }
    })
    if (!existingOrder || existingOrder.status === OrderStatus.PAID) {
      return NextResponse.json(null, { status: 200 })
    }
    await prismadb.$transaction([
      prismadb.order.update({
        where: {
          id: session?.metadata?.orderId
        },
        data: {
          fullName:
            session?.customer_details?.name ||
            session?.customer_details?.email ||
            '',
          address: addressString,
          phone: session?.customer_details?.phone || '',
          status: OrderStatus.PAID
        },
        include: {
          orderItems: true
        }
      }),
      ...existingOrder.orderItems.map((orderItem) =>
        prismadb.product.update({
          where: {
            id: orderItem.productId
          },
          data: {
            stock: {
              decrement: orderItem.quantity
            }
          }
        })
      ),
      prismadb.paymentDetails.upsert({
        where: {
          orderId: session?.metadata?.orderId
        },
        update: {
          method: PaymentMethod.Stripe,
          transactionId: session?.payment_intent?.toString() || ''
        },
        create: {
          method: PaymentMethod.Stripe,
          transactionId: session?.payment_intent?.toString() || '',
          store: {
            connect: {
              id: existingOrder.storeId
            }
          },
          order: {
            connect: {
              id: existingOrder.id
            }
          }
        }
      }),
      prismadb.shipping.upsert({
        where: {
          orderId: session?.metadata?.orderId
        },
        update: {
          status: ShippingStatus.Preparing
        },
        create: {
          status: ShippingStatus.Preparing,
          store: {
            connect: {
              id: existingOrder.storeId
            }
          },
          order: {
            connect: {
              id: existingOrder.id
            }
          }
        }
      })
    ])
  }

  return NextResponse.json(null, { status: 200 })
}
