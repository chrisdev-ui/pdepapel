import { SORT_OPTIONS, SortOption } from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  generateRandomSKU,
  getPublicIdFromCloudinaryUrl,
  parseErrorDetails,
  verifyStoreOwner,
} from "@/lib/utils";
import { getProductsPrices } from "@/lib/discount-engine";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...CACHE_HEADERS.DYNAMIC,
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

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

    if (!name)
      throw ErrorFactory.InvalidRequest(
        "El nombre del producto es obligatorio",
      );
    if (!images || !images.length)
      throw ErrorFactory.InvalidRequest("Las imágenes son obligatorias");
    if (!price) throw ErrorFactory.InvalidRequest("El precio es obligatorio");
    if (!categoryId)
      throw ErrorFactory.InvalidRequest("La categoría es obligatoria");
    if (!sizeId) throw ErrorFactory.InvalidRequest("El tamaño es obligatorio");
    if (!colorId) throw ErrorFactory.InvalidRequest("El color es obligatorio");
    if (!designId)
      throw ErrorFactory.InvalidRequest("El diseño es obligatorio");
    if (stock && stock < 0)
      throw ErrorFactory.InvalidRequest(
        "El stock debe ser cero o mayor a cero",
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

    // Invalidate all product cache entries for this store
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      const pattern = `store:${params.storeId}:products:*`;

      // Get all matching keys
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        // Delete all matching keys
        await redis.del(...keys);
      }
    } catch (error) {
      console.error("Redis cache invalidation error:", error);
    }

    return NextResponse.json(product, {
      headers: {
        ...CACHE_HEADERS.NO_CACHE,
        ...corsHeaders,
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_POST", {
      headers: {
        ...CACHE_HEADERS.NO_CACHE,
        ...corsHeaders,
      },
    });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

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
    const excludeProducts = searchParams.get("excludeProducts") || undefined;

    const minPrice = searchParams.get("minPrice")
      ? Number(searchParams.get("minPrice"))
      : undefined;
    const maxPrice = searchParams.get("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : undefined;

    // Create cache key based on query parameters
    const cacheKey = `store:${params.storeId}:products:${JSON.stringify({
      page,
      itemsPerPage,
      typeId: typeId.sort(),
      categoryId: categoryId.sort(),
      colorId: colorId.sort(),
      sizeId: sizeId.sort(),
      designId: designId.sort(),
      isFeatured,
      includeSupplier,
      onlyNew,
      fromShop,
      limit,
      search,
      sortOption,
      excludeProducts,
      minPrice,
      maxPrice,
    })}`;

    // Try to get from Redis cache
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      const cached = await redis.get(cacheKey);

      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            ...CACHE_HEADERS.DYNAMIC,
            "X-Cache": "HIT",
            ...corsHeaders,
          },
        });
      }
    } catch (error) {
      console.error("Redis get error:", error);
    }

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
    let facets:
      | {
          colors: { id: string; count: number }[];
          formattedSizes: { id: string; count: number }[];
          categories: { id: string; count: number }[];
          designs: { id: string; count: number }[];
        }
      | undefined;

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
      let priceFilter: any = undefined;
      if (minPrice !== undefined || maxPrice !== undefined) {
        priceFilter = {};
        if (minPrice !== undefined) priceFilter.gte = minPrice;
        if (maxPrice !== undefined) priceFilter.lte = maxPrice;
      }

      const whereClause = {
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
        price: priceFilter,
        NOT: {
          id: excludeProducts ? { in: excludeProducts.split(",") } : undefined,
        },
      };

      const [
        productsData,
        count,
        colorFacets,
        sizeFacets,
        categoryFacets,
        designFacets,
      ] = await Promise.all([
        prismadb.product.findMany({
          where: whereClause,
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
        }),
        prismadb.product.count({
          where: whereClause,
        }),
        prismadb.product.groupBy({
          by: ["colorId"],
          where: whereClause,
          _count: {
            colorId: true,
          },
        }),
        prismadb.product.groupBy({
          by: ["sizeId"],
          where: whereClause,
          _count: {
            sizeId: true,
          },
        }),
        prismadb.product.groupBy({
          by: ["categoryId"],
          where: whereClause,
          _count: {
            categoryId: true,
          },
        }),
        prismadb.product.groupBy({
          by: ["designId"],
          where: whereClause,
          _count: {
            designId: true,
          },
        }),
      ]);

      products = productsData;
      totalItems = count;

      facets = {
        colors: colorFacets.map((f) => ({
          id: f.colorId,
          count: f._count.colorId,
        })),
        formattedSizes: sizeFacets.map((f) => ({
          id: f.sizeId,
          count: f._count.sizeId,
        })),
        categories: categoryFacets.map((f) => ({
          id: f.categoryId,
          count: f._count.categoryId,
        })),
        designs: designFacets.map((f) => ({
          id: f.designId,
          count: f._count.designId,
        })),
      };
    }

    const totalPages = fromShop ? Math.ceil(totalItems / itemsPerPage) : 1;

    // Calculate discounted prices
    const pricesMap = await getProductsPrices(products, params.storeId);
    const productsWithPrices = products.map((product) => {
      const pricing = pricesMap.get(product.id);
      return {
        ...product,
        discountedPrice: pricing?.price ?? Number(product.price),
        originalPrice: Number(product.price),
        offerLabel: pricing?.offerLabel ?? null,
      };
    });

    const response = {
      products: productsWithPrices,
      totalItems,
      totalPages: fromShop ? totalPages : 1,
      facets,
    };

    // Cache the response (5 minutes for shop queries, 15 minutes for others)
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      const ttl = fromShop ? 5 * 60 : 15 * 60;
      await redis.set(cacheKey, response, { ex: ttl });
    } catch (error) {
      console.error("Redis set error:", error);
    }

    return NextResponse.json(response, {
      headers: {
        ...CACHE_HEADERS.DYNAMIC,
        "X-Cache": "MISS",
        ...corsHeaders,
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_GET", {
      headers: {
        ...CACHE_HEADERS.DYNAMIC,
        ...corsHeaders,
      },
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0)
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de productos válidos en formato de arreglo",
      );

    await prismadb.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
        include: {
          images: true,
          orderItems: true,
          reviews: true,
        },
      });

      if (products.length !== ids.length)
        throw ErrorFactory.NotFound(
          "Algunos productos no se han encontrado o no pertenecen a esta tienda",
        );

      const productsWithOrders = products.filter(
        (product) => product.orderItems.length > 0,
      );
      if (productsWithOrders.length > 0) {
        throw ErrorFactory.Conflict(
          "No se pueden eliminar productos con órdenes asociadas. Elimina o reasigna las órdenes asociadas primero",
          {
            ...parseErrorDetails(
              "productsWithOrders",
              productsWithOrders.map((p) => ({ id: p.id, name: p.name })),
            ),
          },
        );
      }

      // Collect image public IDs for deletion
      const publicIds = products.flatMap((product) =>
        product.images
          .map((image) => getPublicIdFromCloudinaryUrl(image.url))
          .filter((id): id is string => id !== null && id !== undefined),
      );

      // Delete images from Cloudinary if any exist
      if (publicIds.length > 0) {
        try {
          await cloudinaryInstance.v2.api.delete_resources(publicIds, {
            type: "upload",
            resource_type: "image",
          });
        } catch (cloudinaryError: any) {
          throw ErrorFactory.CloudinaryError(
            cloudinaryError,
            "Ha ocurrido un error al intentar eliminar las imágenes en el servidor Cloudinary",
          );
        }
      }

      await tx.review.deleteMany({
        where: {
          productId: {
            in: ids,
          },
        },
      });

      await tx.image.deleteMany({
        where: {
          productId: {
            in: ids,
          },
        },
      });

      await tx.product.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    // Invalidate all product cache entries for this store
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      const pattern = `store:${params.storeId}:products:*`;

      // Get all matching keys
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        // Delete all matching keys
        await redis.del(...keys);
      }
    } catch (error) {
      console.error("Redis cache invalidation error:", error);
    }

    return NextResponse.json(
      "Los productos han sido eliminados correctamente",
      {
        headers: {
          ...CACHE_HEADERS.NO_CACHE,
          ...corsHeaders,
        },
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_DELETE", {
      headers: {
        ...CACHE_HEADERS.NO_CACHE,
        ...corsHeaders,
      },
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    const {
      ids,
      isArchived,
      isFeatured,
    }: {
      ids: string[];
      isArchived?: boolean;
      isFeatured?: boolean;
    } = body;

    // Validate required fields
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de productos en formato de arreglo",
      );
    }

    // Validate at least one update field is provided
    if (isArchived === undefined && isFeatured === undefined) {
      throw ErrorFactory.InvalidRequest(
        "Al menos un campo de actualización (archivado o destacado) debe ser proporcionado",
      );
    }

    // Verify store ownership
    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      // Verify all products exist and belong to the store
      const existingProducts = await tx.product.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      if (existingProducts.length !== ids.length) {
        throw ErrorFactory.InvalidRequest(
          "Algunos productos no se encontraron o no pertenecen a esta tienda",
        );
      }

      // Update products
      return await tx.product.updateMany({
        where: {
          id: {
            in: ids,
          },
          storeId: params.storeId,
        },
        data: {
          ...(typeof isArchived === "boolean" && { isArchived }),
          ...(typeof isFeatured === "boolean" && { isFeatured }),
        },
      });
    });

    // Invalidate all product cache entries for this store
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      const pattern = `store:${params.storeId}:products:*`;

      // Get all matching keys
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        // Delete all matching keys
        await redis.del(...keys);
      }
    } catch (error) {
      console.error("Redis cache invalidation error:", error);
    }

    return NextResponse.json(result, {
      headers: {
        ...CACHE_HEADERS.NO_CACHE,
        ...corsHeaders,
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_PATCH", {
      headers: {
        ...CACHE_HEADERS.NO_CACHE,
        ...corsHeaders,
      },
    });
  }
}
