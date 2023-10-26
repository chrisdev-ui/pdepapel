import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { userId } = auth()
    const body = await req.json()
    const { name } = body
    if (!userId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!name)
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    const store = await prismadb.store.create({ data: { name, userId } })
    return NextResponse.json(store)
  } catch (error) {
    console.log('[STORES_POST]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
