import { clerkClient } from '@clerk/nextjs'
import {
  Order,
  OrderItem,
  OrderStatus,
  PaymentDetails,
  PaymentMethod,
  Product
} from '@prisma/client'
import { NextResponse } from 'next/server'

import { EmailTemplate } from '@/components/email-template'
import { DEFAULT_COUNTRY } from '@/constants'
import { env } from '@/lib/env.mjs'
import prismadb from '@/lib/prismadb'
import { resend } from '@/lib/resend'
import {
  generateIntegritySignature,
  generateOrderNumber,
  generatePayUSignature,
  getLastOrderTimestamp,
  parseAndSplitAddress
} from '@/lib/utils'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

export interface CheckoutOrder extends Order {
  orderItems: CheckoutOrderItem[]
  payment?: PaymentDetails | null
}

type CheckoutOrderItem = OrderItem & { product: Product }

interface PayUResponse {
  referenceCode: string
  amount: number
  tax?: number
  taxReturnBase?: number
  currency?: string
  signature: string
  test: number
  responseUrl: string
  confirmationUrl: string
  shippingAddress: string
  shippingCity: string
  shippingCountry: string
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
    const { fullName, phone, address, orderItems, userId, guestId, payment } =
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

    const lastOrderTimestamp = await getLastOrderTimestamp(
      authenticatedUserId,
      guestId,
      params.storeId
    )
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000)
    if (lastOrderTimestamp && lastOrderTimestamp > threeMinutesAgo)
      return NextResponse.json(
        { error: 'Too many orders' },
        { status: 429, headers: corsHeaders }
      )
    const errors: string[] = []
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

      if (product.stock - quantity < 0) {
        errors.push(`Product ${productId} stock would become negative`)
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

    const orderNumber = generateOrderNumber()
    const [order] = await prismadb.$transaction([
      prismadb.order.create({
        data: {
          storeId: params.storeId,
          userId: authenticatedUserId,
          guestId: !authenticatedUserId ? guestId : null,
          orderNumber: orderNumber,
          status: OrderStatus.PENDING,
          fullName,
          phone,
          address,
          orderItems: { create: orderItemsData },
          payment: {
            create: {
              storeId: params.storeId,
              method: payment.method
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

    await resend.emails.send({
      from: 'Orders <onboarding@resend.dev>',
      to: ['web.christian.dev@gmail.com', 'papeleria.pdepapel@gmail.com'],
      subject: `Nueva orden de compra - ${fullName}`,
      react: EmailTemplate({
        name: fullName,
        phone,
        address,
        orderNumber,
        paymentMethod: payment.method
      }) as React.ReactElement
    })

    if (payment.method === PaymentMethod.PayU) {
      const payUData = generatePayUPayment(order)

      return NextResponse.json(
        {
          ...payUData
        },
        { headers: corsHeaders }
      )
    }

    const url = await generateWompiPayment(order)

    return NextResponse.json({ url }, { headers: corsHeaders })
  } catch (error: any) {
    console.error('[ORDER_CHECKOUT]', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error.message
      },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function generateWompiPayment(
  order: CheckoutOrder
): Promise<string> {
  const expirationTime = new Date(
    new Date().setHours(new Date().getHours() + 1)
  ).toISOString()

  const amountInCents = calculateTotalAmount(order.orderItems) * 100

  const signatureIntegrity = await generateIntegritySignature({
    reference: order.id,
    amountInCents,
    currency: 'COP',
    integritySecret: env.WOMPI_INTEGRITY_KEY,
    expirationTime
  })

  const url = `https://checkout.wompi.co/p/?public-key=${env.WOMPI_API_KEY}&currency=COP&amount-in-cents=${amountInCents}&reference=${order.id}&signature:integrity=${signatureIntegrity}&redirect-url=${env.FRONTEND_STORE_URL}/order/${order.id}&expiration-time=${expirationTime}`

  return url
}

export function generatePayUPayment(order: CheckoutOrder): PayUResponse {
  const amount = calculateTotalAmount(order.orderItems)
  const { shippingAddress, shippingCity } = parseAndSplitAddress(order.address)
  return {
    referenceCode: order.id,
    amount,
    signature: generatePayUSignature({
      apiKey: env.PAYU_API_KEY,
      merchantId: env.PAYU_MERCHANT_ID,
      referenceCode: order.id,
      amount
    }),
    test: env.NODE_ENV === 'production' ? 0 : 1,
    responseUrl:
      env.NODE_ENV === 'production'
        ? `${env.FRONTEND_STORE_URL}/order/${order.id}`
        : `https://21dmqprm-3001.use2.devtunnels.ms/order/${order.id}`,
    confirmationUrl:
      env.NODE_ENV === 'production'
        ? `${env.ADMIN_WEB_URL}/api/webhook/payu`
        : 'https://4d8b-2800-e6-4010-ec51-ac30-1677-a33f-4dd9.ngrok-free.app/api/webhook/payu',
    shippingAddress,
    shippingCity,
    shippingCountry: DEFAULT_COUNTRY
  }
}

function calculateTotalAmount(orderItems: CheckoutOrderItem[]): number {
  return orderItems.reduce(
    (acc, item) => acc + Number(item.product.price) * item.quantity,
    0
  )
}
