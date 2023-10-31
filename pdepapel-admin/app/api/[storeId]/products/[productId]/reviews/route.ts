import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; productId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  if (!params.productId)
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    )
  try {
    const body = await req.json()
    const { rating, comment } = body
    if (!rating)
      return NextResponse.json({ error: 'Rating is required' }, { status: 400 })
    const review = await prismadb.review.create({
      data: {
        userId,
        storeId: params.storeId,
        productId: params.productId,
        rating,
        comment: comment ?? ''
      }
    })
    return NextResponse.json(review)
  } catch (error) {
    console.log('[REVIEWS_POST]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; productId: string } }
) {
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  try {
    const reviews = await prismadb.review.findMany({
      where: { storeId: params.storeId, productId: params.productId }
    })
    return NextResponse.json(reviews)
  } catch (error) {
    console.log('[REVIEWS_GET]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
