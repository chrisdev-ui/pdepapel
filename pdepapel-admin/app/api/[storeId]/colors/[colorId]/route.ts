import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { colorId: string } }
) {
  try {
    if (!params.colorId)
      return NextResponse.json(
        { error: 'Color ID is required' },
        { status: 400 }
      )

    const color = await prismadb.color.findUnique({
      where: { id: params.colorId }
    })
    return NextResponse.json(color)
  } catch (error) {
    console.log('[COLOR_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; colorId: string } }
) {
  try {
    const { userId } = auth()
    const body = await req.json()
    const { name, value } = body
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (!name)
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!value)
      return NextResponse.json({ error: 'Value is required' }, { status: 400 })
    if (!params.colorId)
      return NextResponse.json(
        { error: 'Color ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const color = await prismadb.color.updateMany({
      where: { id: params.colorId },
      data: {
        name,
        value
      }
    })
    return NextResponse.json(color)
  } catch (error) {
    console.log('[COLOR_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; colorId: string } }
) {
  try {
    const { userId } = auth()
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    if (!params.colorId)
      return NextResponse.json(
        { error: 'Color ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const color = await prismadb.color.deleteMany({
      where: { id: params.colorId }
    })
    return NextResponse.json(color)
  } catch (error) {
    console.log('[COLOR_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
