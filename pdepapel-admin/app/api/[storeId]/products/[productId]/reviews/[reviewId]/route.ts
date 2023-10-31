import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  {
    params
  }: { params: { storeId: string; productId: string; reviewId: string } }
) {
  if (!params.reviewId)
    return NextResponse.json(
      { error: 'Review ID is required' },
      { status: 400 }
    )
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  if (!params.productId)
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    )
  try {
    const review = await prismadb.review.findUnique({
      where: { id: params.reviewId }
    })
    if (!review)
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })

    return NextResponse.json(review)
  } catch (error) {
    console.log('[REVIEW_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  {
    params
  }: { params: { storeId: string; productId: string; reviewId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.reviewId)
    return NextResponse.json(
      { error: 'Review ID is required' },
      { status: 400 }
    )
  if (!params.productId)
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    )
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  try {
    const body = await req.json()
    const { rating, comment } = body
    if (!rating || isNaN(rating))
      return NextResponse.json({ error: 'Rating is required' }, { status: 400 })
    const existingReview = await prismadb.review.findUnique({
      where: { id: params.reviewId }
    })
    if (!existingReview)
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    if (existingReview.userId !== userId)
      return NextResponse.json(
        { error: 'Unauthorized to perform this action' },
        { status: 403 }
      )

    const updatedReview = await prismadb.review.update({
      where: {
        id: params.reviewId,
        productId: params.productId,
        userId
      },
      data: {
        rating,
        comment: comment ?? ''
      }
    })
    return NextResponse.json(updatedReview)
  } catch (error) {
    console.log('[REVIEW_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  {
    params
  }: { params: { storeId: string; reviewId: string; productId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!params.reviewId)
    return NextResponse.json(
      { error: 'Review ID is required' },
      { status: 400 }
    )
  if (!params.productId)
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    )
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  try {
    const reviewToDelete = await prismadb.review.findUnique({
      where: {
        id: params.reviewId,
        productId: params.productId
      }
    })
    if (!reviewToDelete)
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    const isAuthor = userId === reviewToDelete.userId
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    const isStoreOwner = !!storeByUserId
    if (!isStoreOwner && !isAuthor)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const deletedReview = await prismadb.review.delete({
      where: { id: params.reviewId }
    })
    return NextResponse.json(deletedReview)
  } catch (error) {
    console.log('[REVIEW_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
