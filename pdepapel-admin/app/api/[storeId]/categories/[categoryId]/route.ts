import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { categoryId: string } }
) {
  if (!params.categoryId)
    return NextResponse.json(
      { error: 'Category ID is required' },
      { status: 400 }
    )
  try {
    const category = await prismadb.category.findUnique({
      where: { id: params.categoryId }
    })
    return NextResponse.json(category)
  } catch (error) {
    console.log('[CATEGORY_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; categoryId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.categoryId)
    return NextResponse.json(
      { error: 'Category ID is required' },
      { status: 400 }
    )
  try {
    const body = await req.json()
    const { name, typeId } = body
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    if (!name)
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!typeId)
      return NextResponse.json(
        { error: 'Type ID is required' },
        { status: 400 }
      )
    const category = await prismadb.category.updateMany({
      where: { id: params.categoryId },
      data: {
        name,
        typeId
      }
    })
    return NextResponse.json(category)
  } catch (error) {
    console.log('[CATEGORY_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; categoryId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!params.categoryId)
    return NextResponse.json(
      { error: 'Category ID is required' },
      { status: 400 }
    )
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const category = await prismadb.category.deleteMany({
      where: { id: params.categoryId }
    })
    return NextResponse.json(category)
  } catch (error) {
    console.log('[CATEGORY_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
