import prismadb from '@/lib/prismadb'
import { generateRandomSKU } from '@/lib/utils'
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

type SortOption =
  | 'default'
  | 'dateAdded'
  | 'priceLowToHigh'
  | 'priceHighToLow'
  | 'name'
  | 'featuredFirst'

type PriceRanges =
  | '[0,5000]'
  | '[5000,10000]'
  | '[10000,20000]'
  | '[20000,50000]'
  | '[50000,99999999]'

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
    const sku = generateRandomSKU()
    const product = await prismadb.product.create({
      data: {
        name,
        price,
        description,
        stock,
        isArchived,
        isFeatured,
        categoryId,
        sizeId,
        colorId,
        designId,
        sku,
        images: {
          createMany: {
            data: [...images.map((image: { url: string }) => image)]
          }
        },
        storeId: params.storeId
      }
    })
    return NextResponse.json(product)
  } catch (error) {
    console.log('[PRODUCTS_POST]', error)
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
    const { searchParams } = new URL(req.url)
    const typeId = searchParams.get('typeId') || undefined
    const categoryId = searchParams.get('categoryId') || undefined
    const colorId = searchParams.get('colorId') || undefined
    const sizeId = searchParams.get('sizeId') || undefined
    const designId = searchParams.get('designId') || undefined
    const isFeatured = searchParams.get('isFeatured')
    const onlyNew = searchParams.get('onlyNew') || undefined
    const limit = Number(searchParams.get('limit'))
    const sortOption = searchParams.get('sortOption') || 'default'
    const priceRange = searchParams.get('priceRange') || undefined
    const excludeProducts = searchParams.get('excludeProducts') || undefined
    let categoriesIds: string[] = []
    if (typeId) {
      const categoriesForType = await prismadb.category.findMany({
        where: {
          typeId,
          storeId: params.storeId
        },
        select: {
          id: true
        }
      })
      categoriesIds = categoriesForType.map((category) => category.id)
    }
    let products
    const sort: Record<SortOption, Record<string, 'asc' | 'desc'>> = {
      default: { createdAt: 'desc' },
      dateAdded: { createdAt: 'desc' },
      priceLowToHigh: { price: 'asc' },
      priceHighToLow: { price: 'desc' },
      name: { name: 'asc' },
      featuredFirst: { isFeatured: 'desc' }
    }
    const priceRanges = {
      '[0,5000]': { gte: 0, lte: 5000 },
      '[5000,10000]': { gte: 5000, lte: 10000 },
      '[10000,20000]': { gte: 10000, lte: 20000 },
      '[20000,50000]': { gte: 20000, lte: 50000 },
      '[50000,99999999]': { gte: 50000 }
    }
    if (onlyNew) {
      products = await prismadb.product.findMany({
        where: {
          storeId: params.storeId,
          isArchived: false
        },
        include: {
          images: true,
          category: true,
          color: true,
          design: true,
          size: true,
          reviews: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit || undefined
      })
    } else {
      products = await prismadb.product.findMany({
        where: {
          storeId: params.storeId,
          categoryId:
            categoryId ||
            (categoriesIds.length > 0 ? { in: categoriesIds } : undefined),
          colorId,
          sizeId,
          designId,
          isFeatured: isFeatured !== null ? isFeatured === 'true' : undefined,
          isArchived: false,
          price: priceRange
            ? priceRanges[priceRange as PriceRanges]
            : undefined,
          NOT: {
            id: excludeProducts ? { in: excludeProducts.split(',') } : undefined
          }
        },
        include: {
          images: true,
          category: true,
          color: true,
          design: true,
          size: true,
          reviews: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: sort[sortOption as SortOption],
        take: limit || undefined
      })
    }
    return NextResponse.json(products)
  } catch (error) {
    console.log('[PRODUCTS_GET]', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
