import cloudinaryInstance from '@/lib/cloudinary'
import prismadb from '@/lib/prismadb'
import { getPublicIdFromCloudinaryUrl } from '@/lib/utils'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { billboardId: string } }
) {
  try {
    if (!params.billboardId)
      return NextResponse.json(
        { error: 'Billboard ID is required' },
        { status: 400 }
      )

    const billboard = await prismadb.billboard.findUnique({
      where: { id: params.billboardId }
    })
    return NextResponse.json(billboard)
  } catch (error) {
    console.log('[BILLBOARD_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; billboardId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.billboardId)
    return NextResponse.json(
      { error: 'Billboard ID is required' },
      { status: 400 }
    )
  try {
    const body = await req.json()
    const { label, imageUrl } = body

    if (!imageUrl)
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const oldBillboard = await prismadb.billboard.findUnique({
      where: { id: params.billboardId }
    })

    if (!oldBillboard)
      return NextResponse.json(
        { error: 'Billboard not found' },
        { status: 404 }
      )
    const publicId = getPublicIdFromCloudinaryUrl(oldBillboard.imageUrl)
    if (publicId && imageUrl !== oldBillboard.imageUrl)
      await cloudinaryInstance.v2.api.delete_resources([publicId], {
        type: 'upload',
        resource_type: 'image'
      })
    const updatedBillboard = await prismadb.billboard.update({
      where: { id: params.billboardId },
      data: {
        label: label ?? '',
        imageUrl
      }
    })

    return NextResponse.json(updatedBillboard)
  } catch (error) {
    console.log('[BILLBOARD_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; billboardId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.billboardId)
    return NextResponse.json(
      { error: 'Billboard ID is required' },
      { status: 400 }
    )
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const billboardToDelete = await prismadb.billboard.findUnique({
      where: { id: params.billboardId }
    })
    if (!billboardToDelete)
      return NextResponse.json(
        { error: 'Billboard not found' },
        { status: 404 }
      )
    const publicId = getPublicIdFromCloudinaryUrl(billboardToDelete.imageUrl)
    if (publicId) {
      await cloudinaryInstance.v2.api.delete_resources([publicId], {
        type: 'upload',
        resource_type: 'image'
      })
    }
    await prismadb.billboard.delete({
      where: { id: billboardToDelete.id }
    })
    return NextResponse.json(billboardToDelete)
  } catch (error) {
    console.log('[BILLBOARD_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
