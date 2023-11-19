import prismadb from '@/lib/prismadb'
import { OrderStatus, PaymentMethod, ShippingStatus } from '@prisma/client'
import { NextResponse } from 'next/server'

export enum BancolombiaTransferState {
  approved = 'approved',
  rejected = 'rejected',
  pending = 'pending'
}

export async function POST(req: Request) {
  const { transferState, transferCode, transferReference } = await req.json()

  if (transferState === BancolombiaTransferState.approved) {
    const existingOrder = await prismadb.order.findUnique({
      where: {
        id: transferReference
      },
      include: {
        orderItems: true
      }
    })
    if (!existingOrder)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (existingOrder.status === OrderStatus.PAID)
      return NextResponse.json(null, { status: 200 })

    await prismadb.$transaction([
      prismadb.order.update({
        where: {
          id: transferReference
        },
        data: {
          status: OrderStatus.PAID
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
          orderId: transferReference
        },
        update: {
          method: PaymentMethod.Stripe,
          transactionId: transferCode || ''
        },
        create: {
          method: PaymentMethod.Stripe,
          transactionId: transferCode || '',
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
          orderId: transferReference
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
