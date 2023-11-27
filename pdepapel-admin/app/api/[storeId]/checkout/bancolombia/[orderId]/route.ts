import Bancolombia from '@/actions/bancolombia-actions'
import { BancolombiaTransferState } from '@/app/api/webhook/bancolombia/route'
import prismadb from '@/lib/prismadb'
import { clerkClient } from '@clerk/nextjs'
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
  { params }: { params: { storeId: string; orderId: string } }
) {
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  if (!params.orderId)
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
  try {
    const { transferRegistry, validateTransferCode } = new Bancolombia()
    const { buttonId, userId, guestId } = await req.json()

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
    } else if (guestId) {
      authenticatedUserId = guestId
    }

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

    if (!order)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    if (order.status === 'PAID')
      return NextResponse.json(
        { error: 'Order is already paid' },
        { status: 200 }
      )

    if (order.payment?.method !== 'Bancolombia')
      return NextResponse.json(
        { error: 'Invalid payment method' },
        { status: 400 }
      )

    if (
      order.userId !== authenticatedUserId ||
      order.guestId !== authenticatedUserId
    )
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: transferData } = await validateTransferCode({
      transferCode: order.payment?.transactionId ?? ''
    })

    if (
      transferData &&
      transferData[0]?.transferState !== BancolombiaTransferState.pending
    )
      return NextResponse.json(
        { error: 'Order is already paid or being processed.' },
        { status: 400 }
      )

    const { data } = await transferRegistry({
      commerceTransferButtonId: (buttonId as string) || 'h4ShG3NER1C',
      transferReference: order.id,
      transferAmount: order.orderItems.reduce(
        (acc, item) => acc + Number(item.product.price) * item.quantity,
        0
      ),
      transferDescription: `Orden #${order.id} realizada en la Papelería P de Papel`
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
