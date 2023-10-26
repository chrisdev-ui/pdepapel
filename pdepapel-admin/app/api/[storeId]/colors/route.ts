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
    const { name, value } = body
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (!name)
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!value)
      return NextResponse.json({ error: 'Value is required' }, { status: 400 })
    if (!params.storeId)
      return NextResponse.json(
        { error: 'Store ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const color = await prismadb.color.create({
      data: { name, value, storeId: params.storeId }
    })
    return NextResponse.json(color)
  } catch (error) {
    console.log('[COLORS_POST]', error)
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
  try {
    if (!params.storeId)
      return NextResponse.json(
        { error: 'Store ID is required' },
        { status: 400 }
      )
    const colors = await prismadb.color.findMany({
      where: { storeId: params.storeId }
    })
    return NextResponse.json(colors)
  } catch (error) {
    console.log('[COLORS_GET]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
