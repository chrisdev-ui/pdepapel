import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { postId: string } }
) {
  if (!params.postId)
    return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
  try {
    const post = await prismadb.post.findUnique({
      where: { id: params.postId }
    })
    return NextResponse.json(post)
  } catch (error) {
    console.log('[POST_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; postId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.postId)
    return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
  try {
    const body = await req.json()
    const { social, postId } = body
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    if (!social)
      return NextResponse.json(
        { error: 'Social Network is required' },
        { status: 400 }
      )
    if (!postId)
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const post = await prismadb.post.update({
      where: { id: params.postId },
      data: {
        social,
        postId
      }
    })
    return NextResponse.json(post)
  } catch (error) {
    console.log('[POST_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; postId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!params.postId)
    return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const post = await prismadb.type.deleteMany({
      where: { id: params.postId }
    })
    return NextResponse.json(post)
  } catch (error) {
    console.log('[POST_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
