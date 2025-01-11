import {
  PRICE_RANGES,
  PriceRanges,
  SORT_OPTIONS,
  SortOption,
} from "@/constants";
import prismadb from "@/lib/prismadb";
import { generateRandomSKU } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400 },
    );
  try {
    const body = await req.json();
    const {
      name,
      price,
      acqPrice,
      categoryId,
      colorId,
      sizeId,
      designId,
      supplierId,
      description,
      stock,
      images,
      isArchived,
      isFeatured,
    } = body;
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId },
    });
    if (!storeByUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!images || !images.length)
      return NextResponse.json(
        { error: "Images are required" },
        { status: 400 },
      );
    if (!price)
      return NextResponse.json({ error: "Price is required" }, { status: 400 });
    if (!categoryId)
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 },
      );
    if (!sizeId)
      return NextResponse.json(
        { error: "Size ID is required" },
        { status: 400 },
      );
    if (!colorId)
      return NextResponse.json(
        { error: "Color ID is required" },
        { status: 400 },
      );
    if (!designId)
      return NextResponse.json(
        { error: "Design ID is required" },
        { status: 400 },
      );
    if (stock && stock < 0)
      return NextResponse.json(
        { error: "Stock must be 0 or greater" },
        { status: 400 },
      );
    const sku = generateRandomSKU();
    const product = await prismadb.product.create({
      data: {
        name,
        price,
        acqPrice,
        description,
        stock,
        isArchived,
        isFeatured,
        categoryId,
        sizeId,
        colorId,
        designId,
        supplierId,
        sku,
        images: {
          createMany: {
            data: [
              ...images.map((image: { url: string; isMain?: boolean }) => ({
                url: image.url,
                isMain: image.isMain ?? false,
              })),
            ],
          },
        },
        storeId: params.storeId,
      },
    });
    return NextResponse.json(product);
  } catch (error) {
    console.log("[PRODUCTS_POST]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400 },
    );
  try {
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page")) || 1;
    const itemsPerPage = Number(searchParams.get("itemsPerPage")) || 52;
    const typeId = searchParams.get("typeId")?.split(",") || [];
    const categoryId = searchParams.get("categoryId")?.split(",") || [];
    const colorId = searchParams.get("colorId")?.split(",") || [];
    const sizeId = searchParams.get("sizeId")?.split(",") || [];
    const designId = searchParams.get("designId")?.split(",") || [];
    const isFeatured = searchParams.get("isFeatured");
    const includeSupplier = searchParams.get("includeSupplier") || false;
    const onlyNew = searchParams.get("onlyNew") || undefined;
    const fromShop = searchParams.get("fromShop") || undefined;
    const limit = Number(searchParams.get("limit"));
    const search = searchParams.get("search") || "";
    const sortOption = searchParams.get("sortOption") || "default";
    const priceRange = searchParams.get("priceRange") || undefined;
    const excludeProducts = searchParams.get("excludeProducts") || undefined;
    let categoriesIds: string[] = [];
    if (typeId.length > 0) {
      const categoriesForType = await prismadb.category.findMany({
        where: {
          typeId: typeId.length > 0 ? { in: typeId } : undefined,
          storeId: params.storeId,
        },
        select: {
          id: true,
        },
      });
      categoriesIds = categoriesForType.map((category) => category.id);
    }
    let products;
    let totalItems: number = 0;

    if (onlyNew) {
      products = await prismadb.product.findMany({
        where: {
          storeId: params.storeId,
          isArchived: false,
        },
        include: {
          images: true,
          category: true,
          color: true,
          design: true,
          size: true,
          supplier: includeSupplier ? true : undefined,
          reviews: {
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit || undefined,
      });
      totalItems = products.length;
    } else {
      products = await prismadb.product.findMany({
        where: {
          storeId: params.storeId,
          categoryId:
            categoryId.length > 0
              ? { in: categoryId }
              : categoriesIds.length > 0
                ? { in: categoriesIds }
                : undefined,
          colorId: colorId.length > 0 ? { in: colorId } : undefined,
          sizeId: sizeId.length > 0 ? { in: sizeId } : undefined,
          designId: designId.length > 0 ? { in: designId } : undefined,
          OR: [
            { name: search ? { search } : undefined },
            { description: search ? { search } : undefined },
            {
              name: {
                contains: search,
              },
            },
            {
              description: {
                contains: search,
              },
            },
          ],
          isFeatured: isFeatured !== null ? isFeatured === "true" : undefined,
          isArchived: false,
          price: priceRange
            ? PRICE_RANGES[priceRange as PriceRanges]
            : undefined,
          NOT: {
            id: excludeProducts
              ? { in: excludeProducts.split(",") }
              : undefined,
          },
        },
        include: {
          images: true,
          category: true,
          color: true,
          design: true,
          size: true,
          supplier: includeSupplier ? true : undefined,
          reviews: {
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: SORT_OPTIONS[sortOption as SortOption],
        skip: fromShop ? (page - 1) * itemsPerPage : undefined,
        take: limit || (fromShop ? itemsPerPage : undefined),
      });
      totalItems = await prismadb.product.count({
        where: {
          storeId: params.storeId,
          categoryId:
            categoryId.length > 0
              ? { in: categoryId }
              : categoriesIds.length > 0
                ? { in: categoriesIds }
                : undefined,
          colorId: colorId.length > 0 ? { in: colorId } : undefined,
          sizeId: sizeId.length > 0 ? { in: sizeId } : undefined,
          designId: designId.length > 0 ? { in: designId } : undefined,
          OR: [
            { name: search ? { search } : undefined },
            { description: search ? { search } : undefined },
            {
              name: {
                contains: search,
              },
            },
            {
              description: {
                contains: search,
              },
            },
          ],
          isFeatured: isFeatured !== null ? isFeatured === "true" : undefined,
          isArchived: false,
          price: priceRange
            ? PRICE_RANGES[priceRange as PriceRanges]
            : undefined,
          NOT: {
            id: excludeProducts
              ? { in: excludeProducts.split(",") }
              : undefined,
          },
        },
      });
    }
    const totalPages = fromShop ? Math.ceil(totalItems / itemsPerPage) : 1;
    return NextResponse.json({
      products,
      totalItems,
      totalPages: fromShop ? totalPages : 1,
    });
  } catch (error) {
    console.log("[PRODUCTS_GET]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
