import { SORT_OPTIONS, SortOption } from "@/constants";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import {
  Prisma,
  Product,
  Image,
  Category,
  Design,
  Color,
  Size,
  Supplier,
  Review,
} from "@prisma/client";
import { CACHE_HEADERS, generateRandomSKU, getPublicIdFromCloudinaryUrl, parseErrorDetails } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/db-utils";
import { generateSemanticSKU } from "@/lib/variant-generator";

import { getActiveOffers, getProductsPrices } from "@/lib/discount-engine";
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
      productGroupId,
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
    if (stock !== undefined && stock < 0)
      throw ErrorFactory.InvalidRequest(
        "El stock debe ser cero o mayor a cero",
      );

    // Fetch relations to generate Semantic SKU
    const [category, design, color, size] = await Promise.all([
      prismadb.category.findUnique({ where: { id: categoryId } }),
      prismadb.design.findUnique({ where: { id: designId } }),
      prismadb.color.findUnique({ where: { id: colorId } }),
      prismadb.size.findUnique({ where: { id: sizeId } }),
    ]);

    let sku = generateRandomSKU();

    if (category && design && color && size) {
      sku = generateSemanticSKU(
        category.name,
        design.name,
        color.name,
        size.value || size.name,
      );
    }

    const product = await prismadb.product.create({
      data: {
        name,
        price,
        acqPrice,
        description,
        stock: 0, // Stock managed via Inventory System
        isArchived,
        isFeatured,
        categoryId,
        sizeId,
        colorId,
        designId,
        supplierId,
        productGroupId: productGroupId || null,
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
    const limit = Number(searchParams.get("limit"));
    const itemsPerPage =
      limit || Number(searchParams.get("itemsPerPage")) || 52;
    const typeId = searchParams.get("typeId")?.split(",") || [];
    const categoryId = searchParams.get("categoryId")?.split(",") || [];
    const colorId = searchParams.get("colorId")?.split(",") || [];
    const sizeId = searchParams.get("sizeId")?.split(",") || [];
    const designId = searchParams.get("designId")?.split(",") || [];
    const isFeatured = searchParams.get("isFeatured");
    const includeSupplier = searchParams.get("includeSupplier") || false;
    const onlyNew = searchParams.get("onlyNew") || undefined;
    const fromShop = searchParams.get("fromShop") || undefined;
    const search = searchParams.get("search") || "";
    const sortOption = searchParams.get("sortOption") || "default";
    const excludeProducts = searchParams.get("excludeProducts") || undefined;
    const groupBy = searchParams.get("groupBy"); // "parents"

    const productGroupId = searchParams.get("productGroupId");
    const isOnSale = searchParams.get("isOnSale") === "true"; // New filter

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
      groupBy,
      productGroupId,
      isOnSale, // Include in cache key
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

    // Resolve categories from Type if needed
    let categoriesIds: string[] = [];
    if (typeId.length > 0) {
      const categoriesForType = await prismadb.category.findMany({
        where: {
          typeId: { in: typeId },
          storeId: params.storeId,
        },
        select: { id: true },
      });
      categoriesIds = categoriesForType.map((category) => category.id);
    }

    // Common Price Filter
    let priceFilter: any = undefined;
    if (minPrice !== undefined || maxPrice !== undefined) {
      priceFilter = {};
      if (minPrice !== undefined) priceFilter.gte = minPrice;
      if (maxPrice !== undefined) priceFilter.lte = maxPrice;
    }

    // ---------------------------------------------------------
    // "ON SALE" FILTER LOGIC
    // ---------------------------------------------------------
    let onSaleFilter: Prisma.ProductWhereInput | undefined = undefined;
    if (isOnSale || sortOption === "isOnSale") {
      const activeOffers = await getActiveOffers(params.storeId);
      if (activeOffers.length > 0) {
        // Collect all IDs that have effective offers
        // Note: use Set to avoid duplicates
        const productIds = new Set<string>();
        const categoryIds = new Set<string>();
        const groupIds = new Set<string>();

        activeOffers.forEach((offer: any) => {
          offer.products.forEach((p: any) => productIds.add(p.productId));
          offer.categories.forEach((c: any) => categoryIds.add(c.categoryId));
          offer.productGroups.forEach((g: any) =>
            groupIds.add(g.productGroupId),
          );
        });

        onSaleFilter = {
          OR: [
            { id: { in: Array.from(productIds) } },
            { categoryId: { in: Array.from(categoryIds) } },
            { productGroupId: { in: Array.from(groupIds) } },
          ],
        };
      } else {
        // If no active offers but filtered by onSale, return nothing
        onSaleFilter = { id: "NO_MATCH" }; // Impossible ID
      }
    }

    interface FacetCount {
      id: string;
      count: number;
    }

    interface ProductFacets {
      colors: FacetCount[];
      formattedSizes: FacetCount[];
      categories: FacetCount[];
      designs: FacetCount[];
    }

    // Custom type for unified product response
    type StorefrontProduct = Partial<Product> & {
      id: string; // Required
      price: number | Prisma.Decimal; // Required
      categoryId: string; // Required for discount engine
      isGroup?: boolean;
      productGroupId: string | null;
      variantCount?: number;
      minPrice?: number;
      maxPrice?: number;
      offerLabel?: string | null;
      hasDiscount?: boolean;
      discountedPrice?: number;
      originalPrice?: number;
      images?: Image[];
      category?: Category;
      design?: Design;
      color?: Color;
      size?: Size;
      reviews?: (Pick<Review, "rating"> & Partial<Review>)[]; // Reviews in group are flattened
      supplier?: Supplier | null;
    };

    let products: StorefrontProduct[] = [];
    let totalItems: number = 0;
    let totalPages: number = 0;
    let facets: ProductFacets | undefined = undefined;

    // ---------------------------------------------------------
    // GROUP BY PARENTS LOGIC
    // ---------------------------------------------------------
    if (groupBy === "parents") {
      // Filter for Products (used to filter Groups via relation)
      const productFilters = {
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
        isArchived: false,
        price: priceFilter,
        NOT: {
          id: excludeProducts ? { in: excludeProducts.split(",") } : undefined,
        },
      };

      // 1. Count Groups that have at least one matching product
      // OR search matches Group Name/Desc
      const groupWhere = {
        storeId: params.storeId,
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
          // Or matches children
          { products: { some: productFilters } },
        ],
        products: { some: {} }, // Ensure it has at least one product? Optional.
      };

      // Refined Group Where: if search is present, it might match group fields.
      // If filters are present, they must match children.
      // The OR logic above is simplistic.
      // More strict:
      // (Name matches OR Desc matches OR Products match search) AND (Products match filters)

      const baseGroupWhere: any = {
        storeId: params.storeId,
        products: { some: productFilters }, // Filters must match children
        ...(isOnSale && onSaleFilter?.OR?.[2] // If looking for Group offers specifically
          ? {
              OR: [
                { products: { some: productFilters } }, // Match via children (inherited category/product offers)
                { id: onSaleFilter.OR[2].productGroupId }, // Match via direct Group Offer
              ],
            }
          : {}),
      };

      if (search) {
        baseGroupWhere.OR = [
          { name: { contains: search } },
          { description: { contains: search } },
          {
            products: {
              some: {
                OR: [
                  { name: { contains: search } },
                  { description: { contains: search } },
                ],
              },
            },
          },
        ];
      }

      const groupCount = await prismadb.productGroup.count({
        where: baseGroupWhere,
      });

      // 2. Count Standalone Products (productGroupId = null)
      const standaloneWhere = {
        ...productFilters,
        productGroupId: null,
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
        ],
      };
      const standaloneCount = await prismadb.product.count({
        where: standaloneWhere,
      });

      const totalItems = groupCount + standaloneCount;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      // Pagination Logic
      let fetchedGroups: any[] = [];
      let fetchedProducts: any[] = [];
      const offset = (page - 1) * itemsPerPage;

      // Fetch Groups if we are in the group slice
      if (offset < groupCount) {
        fetchedGroups = await prismadb.productGroup.findMany({
          where: baseGroupWhere,
          take: itemsPerPage,
          skip: offset,
          include: {
            images: true,
            products: {
              select: {
                price: true,
                stock: true,
                id: true,
                category: true,
                categoryId: true,
                reviews: {
                  select: {
                    rating: true,
                  },
                },
              }, // Need min price & ID & Category & Reviews for aggregation
            },
          },
          orderBy: { createdAt: "desc" }, // Default sort
        });
      }

      // Fetch Standalone if we need to fill the page or are past groups
      const itemsNeeded = itemsPerPage - fetchedGroups.length;
      if (itemsNeeded > 0 && offset + itemsPerPage > groupCount) {
        // Calculate standalone skip
        // If we skipped all groups (offset >= groupCount), skip = offset - groupCount
        // If we partially fetched groups (offset < groupCount), then skip = 0 (start from beginning of standalones)
        const standaloneSkip = Math.max(0, offset - groupCount);

        fetchedProducts = await prismadb.product.findMany({
          where: standaloneWhere,
          take: itemsNeeded,
          skip: standaloneSkip,
          include: {
            images: true,
            category: true,
            color: true,
            size: true,
            design: true,
          },
          orderBy: SORT_OPTIONS[sortOption as SortOption] || {
            createdAt: "desc",
          },
        });
      }

      // Merge and Transform
      // We map Groups to look like Products for consistent frontend typing
      const merged = [
        ...fetchedGroups.map((g) => {
          const prices = g.products.map((p: any) => p.price);
          const minP = prices.length ? Math.min(...prices) : 0;
          const maxP = prices.length ? Math.max(...prices) : 0;
          return {
            id: g.products[0]?.id || g.id, // Use first variant ID for linking, fallback to group ID
            productGroupId: g.id, // Keep real group ID reference
            name: g.name,
            description: g.description,
            images: g.images,
            price: minP, // Use min price for display
            originalPrice: minP,
            isGroup: true,
            minPrice: minP,
            maxPrice: maxP,
            variantCount: g.products.length,
            category: g.products[0]?.category,
            categoryId: g.products[0]?.categoryId || "",
            reviews: g.products.flatMap((p: any) => p.reviews),
            sku: "GROUP",
          };
        }),
        ...fetchedProducts.map((p) => ({
          ...p,
          isGroup: false,
          originalPrice: Number(p.price),
          discountedPrice: Number(p.price), // Calculate below
        })),
      ];

      // ---------------------------------------------------------
      // CALCULATE DISCOUNTS (Batched)
      // ---------------------------------------------------------
      // 1. Collect all "Variant" products from Groups + Standalone products
      const allVariantProducts: any[] = [];
      fetchedGroups.forEach((g) => {
        allVariantProducts.push(
          ...g.products.map((p: any) => ({
            ...p,
            productGroupId: g.id, // Ensure correlation
          })),
        );
      });
      allVariantProducts.push(...fetchedProducts);

      // 2. Batch Calculate
      const { getProductsPrices } = await import("@/lib/discount-engine");
      const allPricesMap = await getProductsPrices(
        allVariantProducts,
        params.storeId,
      );

      // 3. Re-map merged results with calculated prices
      const finalResponse = merged.map((item) => {
        if (item.isGroup) {
          // For groups, find its variants in the map and recalculate min/max
          const groupVariants = allVariantProducts.filter(
            (p) => p.productGroupId === item.productGroupId,
          );
          if (groupVariants.length > 0) {
            const variantPrices = groupVariants.map((v) => {
              const pricing = allPricesMap.get(v.id);
              return pricing?.price ?? Number(v.price);
            });

            // Check if any variant has a discount
            const hasDiscount = groupVariants.some((v) => {
              const pricing = allPricesMap.get(v.id);
              return pricing && pricing.discount > 0;
            });

            // Get offer label from the first variant that has one (simplified)
            const offerLabel =
              groupVariants
                .map((v) => allPricesMap.get(v.id)?.offerLabel)
                .find((l) => l) || null;

            const minP = Math.min(...variantPrices);
            const maxP = Math.max(...variantPrices);

            // Calculate base prices to determine originalPrice
            const variantBasePrices = groupVariants.map((v) => Number(v.price));
            const minBaseP = Math.min(...variantBasePrices);

            return {
              ...item,
              price: minP, // Display discounted min
              originalPrice: minBaseP, // Comparison base
              minPrice: minP,
              maxPrice: maxP,
              offerLabel: hasDiscount ? offerLabel : null,
              hasDiscount, // Flag for UI
            };
          }
          return item;
        } else {
          // Standalone
          const pricing = allPricesMap.get(item.id);
          const effectivePrice = pricing?.price ?? Number(item.price);
          return {
            ...item,
            price: effectivePrice, // Always effective
            originalPrice: Number(item.price), // Always base
            discountedPrice: effectivePrice,
            offerLabel: pricing?.offerLabel ?? null,
            hasDiscount: pricing ? pricing.discount > 0 : false,
          };
        }
      });

      const response = {
        products: finalResponse,
        totalItems,
        totalPages,
        facets: undefined, // Facet calc omitted for speed in this mode or need complex agg
      };

      return NextResponse.json(response, {
        headers: {
          ...CACHE_HEADERS.DYNAMIC,
          "X-Cache": "MISS",
          ...corsHeaders,
        },
      });
    }

    // ---------------------------------------------------------
    // ORIGINAL LOGIC (With minor fixes)
    // ---------------------------------------------------------

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
    } else if (sortOption === "isOnSale") {
      // ---------------------------------------------------------
      // SPLIT PAGINATION FOR "ON SALE" SORT
      // ---------------------------------------------------------

      // 1. Define Base Filters (Shared)
      const baseProductWhere: Prisma.ProductWhereInput = {
        storeId: params.storeId,
        productGroupId: productGroupId ? productGroupId : undefined,
        categoryId:
          categoryId.length > 0
            ? { in: categoryId }
            : categoriesIds.length > 0
              ? { in: categoriesIds }
              : undefined,
        colorId: colorId.length > 0 ? { in: colorId } : undefined,
        sizeId: sizeId.length > 0 ? { in: sizeId } : undefined,
        designId: designId.length > 0 ? { in: designId } : undefined,
        OR: search
          ? [
              { name: { contains: search } },
              { description: { contains: search } },
            ]
          : undefined,
        isFeatured: isFeatured !== null ? isFeatured === "true" : undefined,
        isArchived: false,
        price: priceFilter,
        NOT: {
          id: excludeProducts ? { in: excludeProducts.split(",") } : undefined,
        },
      };

      // 2. Define Partitions
      // Partition A:Items ON SALE
      // We use the already calculated `onSaleFilter` which contains IDs of discounted items
      const whereSales: Prisma.ProductWhereInput = {
        ...baseProductWhere,
        AND: [onSaleFilter || { id: "NO_MATCH" }],
      };

      // Partition B: Regular Items (NOT in Sale List)
      const whereRegular: Prisma.ProductWhereInput = {
        ...baseProductWhere,
        AND: [
          {
            NOT: onSaleFilter,
          },
        ],
      };

      // 3. Count Sales to Determine Split
      const totalSales = await prismadb.product.count({ where: whereSales });

      // 4. Determine Pagination Strategy
      const offset = (page - 1) * itemsPerPage;
      let fetchedSales: any[] = [];
      let fetchedRegular: any[] = [];

      // Fetch Sales if current page touches the sale slice
      if (offset < totalSales) {
        fetchedSales = await prismadb.product.findMany({
          where: whereSales,
          take: itemsPerPage,
          skip: offset, // Standard skip within the sale list
          include: {
            images: true,
            category: true,
            color: true,
            design: true,
            size: true,
            supplier: includeSupplier ? true : undefined,
            reviews: { orderBy: { createdAt: "desc" } },
          },
          orderBy: { createdAt: "desc" }, // Secondary sort
        });
      }

      // Fetch Regular if we need to fill the page
      const itemsNeeded = itemsPerPage - fetchedSales.length;
      if (itemsNeeded > 0) {
        // Calculate offset for regular items
        // If we exhausted sales (offset >= totalSales), we skip (offset - totalSales) into regular
        // If we are transitioning (fetched some sales), we start simple regular list at 0
        const regularSkip = Math.max(0, offset - totalSales);

        fetchedRegular = await prismadb.product.findMany({
          where: whereRegular,
          take: itemsNeeded,
          skip: regularSkip,
          include: {
            images: true,
            category: true,
            color: true,
            design: true,
            size: true,
            supplier: includeSupplier ? true : undefined,
            reviews: { orderBy: { createdAt: "desc" } },
          },
          orderBy: { createdAt: "desc" }, // Secondary sort
        });
      }

      products = [...fetchedSales, ...fetchedRegular];

      // Calculate Total Counts for Facetting/Pagination
      // Note: for performance we might skip calculating facets deeply if not strictly needed or handle differently
      // For now, simpler implementation:

      const totalRegular = await prismadb.product.count({
        where: whereRegular,
      });
      totalItems = totalSales + totalRegular;

      // Facets (We just recount globally roughly or run parallel queries similar to standard flow)
      // To save complexity in this "hack", we will just return simplified facets or standard
      // Let's run standard facet queries on the GLOBAL set (baseProductWhere) ignoring the sort split
      const [colorFacets, sizeFacets, categoryFacets, designFacets] =
        await Promise.all([
          prismadb.product.groupBy({
            by: ["colorId"],
            where: baseProductWhere,
            _count: { colorId: true },
          }),
          prismadb.product.groupBy({
            by: ["sizeId"],
            where: baseProductWhere,
            _count: { sizeId: true },
          }),
          prismadb.product.groupBy({
            by: ["categoryId"],
            where: baseProductWhere,
            _count: { categoryId: true },
          }),
          prismadb.product.groupBy({
            by: ["designId"],
            where: baseProductWhere,
            _count: { designId: true },
          }),
        ]);

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
    } else {
      const whereClause: Prisma.ProductWhereInput = {
        storeId: params.storeId,
        productGroupId: productGroupId ? productGroupId : undefined,
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
          { name: { contains: search } },
          { description: { contains: search } },
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

    totalPages = fromShop ? Math.ceil(totalItems / itemsPerPage) : 1;

    // Calculate discounted prices
    const pricesMap = await getProductsPrices(products, params.storeId);
    const productsWithPrices = products.map((product) => {
      const pricing = pricesMap.get(product.id);
      const effectivePrice = pricing?.price ?? Number(product.price);
      return {
        ...product,
        price: effectivePrice, // Always effective
        originalPrice: Number(product.price), // Always base
        discountedPrice: effectivePrice,
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
