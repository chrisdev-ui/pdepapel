import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { mainBannerId: string } }
) {
  try {
    if (!params.mainBannerId)
      return new NextResponse('Banner ID is required', { status: 400 })

    const mainBanner = await prismadb.mainBanner.findUnique({
      where: { id: params.mainBannerId }
    })
    return NextResponse.json(mainBanner)
  } catch (error) {
    console.log('[MAIN_BANNER_GET]', error)
    return new NextResponse('Internal Error', { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; mainBannerId: string } }
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
    if (!params.mainBannerId)
      return new NextResponse('Banner ID is required', { status: 400 })
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId) return new NextResponse('Unauthorized', { status: 403 })
    const mainBanner = await prismadb.mainBanner.update({
      where: { id: params.mainBannerId },
      data: {
        title,
        label1,
        label2,
        highlight,
        callToAction,
        imageUrl
      }
    })
    return NextResponse.json(mainBanner)
  } catch (error) {
    console.log('[MAIN_BANNER_PATCH]', error)
    return new NextResponse('Internal Error', { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; mainBannerId: string } }
) {
  try {
    const { userId } = auth()
    if (!userId) return new NextResponse('Unauthenticated', { status: 401 })

    if (!params.mainBannerId)
      return new NextResponse('Banner ID is required', { status: 400 })
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId) return new NextResponse('Unauthorized', { status: 403 })
    const mainBanner = await prismadb.mainBanner.deleteMany({
      where: { id: params.mainBannerId }
    })
    return NextResponse.json(mainBanner)
  } catch (error) {
    console.log('[MAIN_BANNER_DELETE]', error)
    return new NextResponse('Internal Error', { status: 500 })
  }
}
