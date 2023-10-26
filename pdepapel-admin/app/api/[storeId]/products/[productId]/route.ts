import prismadb from '@/lib/prismadb'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { productId: string } }
) {
  try {
    if (!params.productId)
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      )

    const product = await prismadb.product.findUnique({
      where: { id: params.productId },
      include: {
        images: true,
        category: true,
        size: true,
        color: true,
        design: true
      }
    })
    return NextResponse.json(product)
  } catch (error) {
    console.log('[PRODUCT_GET]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; productId: string } }
) {
  try {
    const { userId } = auth()
    const body = await req.json()
    const {
      name,
      price,
      categoryId,
      colorId,
      sizeId,
      designId,
      description,
      stock,
      ratings,
      images,
      isArchived,
      isFeatured
    } = body
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (!name)
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!images || !images.length)
      return NextResponse.json(
        { error: 'Images are required' },
        { status: 400 }
      )
    if (!price)
      return NextResponse.json({ error: 'Price is required' }, { status: 400 })
    if (!categoryId)
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      )
    if (!sizeId)
      return NextResponse.json(
        { error: 'Size ID is required' },
        { status: 400 }
      )
    if (!colorId)
      return NextResponse.json(
        { error: 'Color ID is required' },
        { status: 400 }
      )
    if (!designId)
      return NextResponse.json(
        { error: 'Design ID is required' },
        { status: 400 }
      )
    if (!stock)
      return NextResponse.json(
        { error: 'Stock must be greater than 0' },
        { status: 400 }
      )
    if (!params.productId)
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    await prismadb.product.update({
      where: { id: params.productId },
      data: {
        name,
        price,
        categoryId,
        colorId,
        sizeId,
        designId,
        isArchived,
        isFeatured,
        stock,
        ratings,
        description,
        images: {
          deleteMany: {}
        }
      }
    })

    const product = await prismadb.product.update({
      where: { id: params.productId },
      data: {
        images: {
          createMany: {
            data: [...images.map((image: { url: string }) => image)]
          }
        }
      }
    })
    return NextResponse.json(product)
  } catch (error) {
    console.log('[PRODUCT_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; productId: string } }
) {
  try {
    const { userId } = auth()
    if (!userId)
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    if (!params.productId)
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      )
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const product = await prismadb.product.deleteMany({
      where: { id: params.productId }
    })
    return NextResponse.json(product)
  } catch (error) {
    console.log('[PRODUCT_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
