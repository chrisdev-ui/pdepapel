import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { sizeId: string } }
) {
  if (!params.sizeId)
    return NextResponse.json({ error: 'Size ID is required' }, { status: 400 })
  try {
    const size = await prismadb.size.findUnique({
      where: { id: params.sizeId }
    })
    return NextResponse.json(size)
  } catch (error) {
    console.log('[SIZE_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; sizeId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.sizeId)
    return NextResponse.json({ error: 'Size ID is required' }, { status: 400 })
  try {
    const body = await req.json()
    const { name, value } = body
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    if (!name)
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!value)
      return NextResponse.json({ error: 'Value is required' }, { status: 400 })
    const size = await prismadb.size.updateMany({
      where: { id: params.sizeId },
      data: {
        name,
        value
      }
    })
    return NextResponse.json(size)
  } catch (error) {
    console.log('[SIZE_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; sizeId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!params.sizeId)
    return NextResponse.json({ error: 'Size ID is required' }, { status: 400 })
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const size = await prismadb.size.deleteMany({
      where: { id: params.sizeId }
    })
    return NextResponse.json(size)
  } catch (error) {
    console.log('[SIZE_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
