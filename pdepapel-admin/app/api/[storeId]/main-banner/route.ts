import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const { userId } = auth()
    const body = await req.json()
    const { title, label1, label2, highlight, callToAction, imageUrl } = body
    if (!userId) return new NextResponse('Unauthenticated', { status: 401 })
    if (!imageUrl)
      return new NextResponse('Image URL is required', { status: 400 })
    if (!callToAction) {
      return new NextResponse('Call to action is required', { status: 400 })
    }
    if (!params.storeId)
      return new NextResponse('Store ID is required', { status: 400 })
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId) return new NextResponse('Unauthorized', { status: 403 })
    const mainBanner = await prismadb.mainBanner.create({
      data: {
        title,
        label1,
        label2,
        highlight,
        callToAction,
        imageUrl,
        storeId: params.storeId
      }
    })
    return NextResponse.json(mainBanner)
  } catch (error) {
    console.log('[MAIN_BANNERS_POST]', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    if (!params.storeId)
      return new NextResponse('Store ID is required', { status: 400 })
    const mainBanner = await prismadb.mainBanner.findFirst({
      where: { storeId: params.storeId }
    })
    return NextResponse.json(mainBanner)
  } catch (error) {
    console.log('[MAIN_BANNERS_GET]', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}