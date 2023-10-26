import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { designId: string } }
) {
  try {
    if (!params.designId)
      return NextResponse.json(
        { error: 'Design ID is required' },
        { status: 400 }
      )

    const design = await prismadb.design.findUnique({
      where: { id: params.designId }
    })
    return NextResponse.json(design)
  } catch (error) {
    console.log('[DESIGN_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; designId: string } }
) {
  try {
    const { userId } = auth()
    const body = await req.json()
    const { name } = body
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (!name)
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!params.designId)
      return NextResponse.json(
        { error: 'Design ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const design = await prismadb.design.updateMany({
      where: { id: params.designId },
      data: {
        name
      }
    })
    return NextResponse.json(design)
  } catch (error) {
    console.log('[DESIGN_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; designId: string } }
) {
  try {
    const { userId } = auth()
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    if (!params.designId)
      return NextResponse.json(
        { error: 'Design ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const design = await prismadb.design.deleteMany({
      where: { id: params.designId }
    })
    return NextResponse.json(design)
  } catch (error) {
    console.log('[DESIGN_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
