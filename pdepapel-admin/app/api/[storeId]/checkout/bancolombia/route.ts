import Bancolombia from '@/actions/bancolombia-actions'
import prismadb from '@/lib/prismadb'
import { generateOrderNumber } from '@/lib/utils'
import { clerkClient } from '@clerk/nextjs'
import { OrderStatus, PaymentMethod } from '@prisma/client'
import { NextResponse } from 'next/server'

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
    const { fullName, phone, address, orderItems, userId, guestId, buttonId } =
      await req.json()

    let authenticatedUserId = null
    if (userId) {
      const user = await clerkClient.users.getUser(userId)
      if (user) {
        authenticatedUserId = user.id
      } else {
        return NextResponse.json(
          { error: 'Unauthenticated' },
          { status: 401, headers: corsHeaders }
        )
      }
    }
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

    const errors: string[] = []
    const { transferRegistry } = new Bancolombia()
    const orderItemsData = []

    const productIds = orderItems.map(
      (item: { productId: string }) => item.productId
    )
    const products = await prismadb.product.findMany({
      where: { id: { in: productIds } }
    })

    for (const { productId, quantity = 1 } of orderItems) {
      const product = products.find((product) => product.id === productId)

      if (!product) {
        errors.push(`Product ${productId} not found`)
        continue
      }

      if (product.stock < quantity) {
        errors.push(`Product ${productId} out of stock`)
        continue
      }

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
          fullName,
          phone,
          address,
          orderItems: { create: orderItemsData },
          payment: {
            create: {
              storeId: params.storeId,
              method: PaymentMethod.Bancolombia
            }
          }
        },
        include: {
          orderItems: {
            include: {
              product: true
            }
          }
        }
      })
    ])

    const { data } = await transferRegistry({
      commerceTransferButtonId: (buttonId as string) || 'h4ShG3NER1C',
      transferReference: order.id,
      transferAmount: order.orderItems.reduce(
        (acc, item) => acc + Number(item.product.price) * item.quantity,
        0
      ),
      transferDescription: `Orden #${order.id} realizada en la Papelería P de Papel`
    })

    await prismadb.order.update({
      where: { id: order.id },
      data: {
        payment: {
          update: {
            transactionId: data[0]?.transferCode
          }
        }
      }
    })

    return NextResponse.json(
      { url: data[0]?.redirectURL },
      { headers: corsHeaders }
    )
  } catch (error: any) {
    console.error('[ORDER_BANCOLOMBIA_CHECKOUT]', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error.message
      },
      { status: 500, headers: corsHeaders }
    )
  }
}