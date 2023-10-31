import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  try {
    const body = await req.json()
    const { callToAction, imageUrl } = body
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    if (!imageUrl)
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      )
    if (!callToAction)
      return NextResponse.json(
        { error: 'Call to action is required' },
        { status: 400 }
      )

    const banner = await prismadb.banner.create({
      data: {
        callToAction,
        imageUrl,
        storeId: params.storeId
      }
    })
    return NextResponse.json(banner)
  } catch (error) {
    console.log('[BANNERS_POST]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  if (!params.storeId)
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  try {
    const banners = await prismadb.banner.findMany({
      where: { storeId: params.storeId }
    })
    return NextResponse.json(banners)
  } catch (error) {
    console.log('[BANNERS_GET]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
