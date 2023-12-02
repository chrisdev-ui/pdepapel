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
    const { label, imageUrl, title, redirectUrl } = body
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    if (!label)
      return NextResponse.json({ error: 'Label is required' }, { status: 400 })
    if (!imageUrl)
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      )
    const billboard = await prismadb.billboard.create({
      data: {
        label,
        imageUrl,
        title: title ?? '',
        redirectUrl: redirectUrl ?? '',
        storeId: params.storeId
      }
    })
    return NextResponse.json(billboard)
  } catch (error) {
    console.log('[BILLBOARDS_POST]', error)
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
    const billboards = await prismadb.billboard.findMany({
      where: { storeId: params.storeId }
    })
    return NextResponse.json(billboards)
  } catch (error) {
    console.log('[BILLBOARDS_GET]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
