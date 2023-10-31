import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { typeId: string } }
) {
  if (!params.typeId)
    return NextResponse.json({ error: 'Type ID is required' }, { status: 400 })
  try {
    const type = await prismadb.type.findUnique({
      where: { id: params.typeId }
    })
    return NextResponse.json(type)
  } catch (error) {
    console.log('[TYPE_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; typeId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.typeId)
    return NextResponse.json({ error: 'Type ID is required' }, { status: 400 })
  try {
    const body = await req.json()
    const { name } = body
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    if (!name)
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const type = await prismadb.type.updateMany({
      where: { id: params.typeId },
      data: {
        name
      }
    })
    return NextResponse.json(type)
  } catch (error) {
    console.log('[TYPE_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; typeId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!params.typeId)
    return NextResponse.json({ error: 'Type ID is required' }, { status: 400 })
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const type = await prismadb.type.deleteMany({
      where: { id: params.typeId }
    })
    return NextResponse.json(type)
  } catch (error) {
    console.log('[TYPE_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
