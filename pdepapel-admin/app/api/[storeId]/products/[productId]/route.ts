import cloudinaryInstance from '@/lib/cloudinary'
import prismadb from '@/lib/prismadb'
import { getPublicIdFromCloudinaryUrl } from '@/lib/utils'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { productId: string } }
) {
  if (!params.productId)
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    )
  try {
    const product = await prismadb.product.findUnique({
      where: { id: params.productId },
      include: {
        images: true,
        category: true,
        size: true,
        color: true,
        design: true,
        reviews: true
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
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!params.productId)
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    )
  try {
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
      images,
      isArchived,
      isFeatured
    } = body
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
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
    const productToUpdate = await prismadb.product.findUnique({
      where: { id: params.productId },
      include: { images: true }
    })
    if (!productToUpdate)
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    const currentImageUrls = productToUpdate.images.map((image) => image.url)
    const newImageUrls = images.map((image: { url: string }) => image.url)
    const imagesToDelete = currentImageUrls.filter(
      (url) => !newImageUrls.includes(url)
    )
    const publicIds = imagesToDelete.map(
      (url) => getPublicIdFromCloudinaryUrl(url) ?? ''
    )
    if (publicIds.length)
      await cloudinaryInstance.v2.api.delete_resources(publicIds, {
        type: 'upload',
        resource_type: 'image'
      })
    const [_, updatedProduct] = await prismadb.$transaction([
      prismadb.product.update({
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
          description,
          images: {
            deleteMany: {}
          }
        }
      }),
      prismadb.product.update({
        where: { id: params.productId },
        data: {
          images: {
            createMany: {
              data: [...images.map((image: { url: string }) => image)]
            }
          }
        }
      })
    ])
    return NextResponse.json(updatedProduct)
  } catch (error) {
    console.log('[PRODUCT_PATCH]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; productId: string } }
) {
  const { userId } = auth()
  if (!userId)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!params.productId)
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    )
  try {
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId }
    })
    if (!storeByUserId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const productToDelete = await prismadb.product.findUnique({
      where: { id: params.productId },
      include: { images: true }
    })
    if (!productToDelete)
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    const publicIds = productToDelete.images.map(
      (image) => getPublicIdFromCloudinaryUrl(image.url) ?? ''
    )
    await cloudinaryInstance.v2.api.delete_resources(publicIds, {
      type: 'upload',
      resource_type: 'image'
    })
    const deletedProduct = await prismadb.product.deleteMany({
      where: { id: params.productId }
    })
    return NextResponse.json(deletedProduct)
  } catch (error) {
    console.log('[PRODUCT_DELETE]', error)
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
