import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { bannerId: string } }
) {
  try {
    if (!params.bannerId)
      return NextResponse.json(
        { error: 'Banner ID is required' },
        { status: 400 }
      )

    const banner = await prismadb.banner.findUnique({
      where: { id: params.bannerId }
    })
    return NextResponse.json(banner)
  } catch (error) {
    console.log('[BANNER_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; bannerId: string } }
) {
  try {
    const { userId } = auth()
    const body = await req.json()
    const { callToAction, imageUrl } = body
    if (!userId) return new NextResponse('Unauthenticated', { status: 401 })
    if (!imageUrl)
      return new NextResponse('Image URL is required', { status: 400 })
    if (!callToAction) {
      return new NextResponse('Call to action is required', { status: 400 })
    }
    if (!params.bannerId)
      return new NextResponse('Banner ID is required', { status: 400 })
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId) return new NextResponse('Unauthorized', { status: 403 })
    const banner = await prismadb.banner.updateMany({
      where: { id: params.bannerId },
      data: {
        callToAction,
        imageUrl
      }
    })
    return NextResponse.json(banner)
  } catch (error) {
    console.log('[BANNER_PATCH]', error)
    return new NextResponse('Internal Error', { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; bannerId: string } }
) {
  try {
    const { userId } = auth()
    if (!userId) return new NextResponse('Unauthenticated', { status: 401 })

    if (!params.bannerId)
      return new NextResponse('Banner ID is required', { status: 400 })
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId) return new NextResponse('Unauthorized', { status: 403 })
    const banner = await prismadb.banner.deleteMany({
      where: { id: params.bannerId }
    })
    return NextResponse.json(banner)
  } catch (error) {
    console.log('[BANNER_DELETE]', error)
    return new NextResponse('Internal Error', { status: 500 })
  }
}
