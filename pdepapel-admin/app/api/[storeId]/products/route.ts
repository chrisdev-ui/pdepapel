import { SORT_OPTIONS, SortOption } from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
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
import {
  CACHE_HEADERS,
  generateRandomSKU,
  getPublicIdFromCloudinaryUrl,
  parseErrorDetails,
  verifyStoreOwner,
} from "@/lib/utils";
import { generateSemanticSKU } from "@/lib/variant-generator";
import { generateProductSlug } from "@/lib/slugify";
import { normalizeProductIdentifiers } from "@/lib/product-identifiers";
import { sanitizeRichTextHtml } from "@/lib/rich-text";
import {
  getUniqueProductSlug,
  synchronizeProductGroupSlugs,
} from "@/lib/product-slugs";

import { getActiveOffers, getProductsPrices } from "@/lib/discount-engine";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

import { invalidateStoreProductsCache } from "@/lib/cache";
import {
  syncProductCatalogAttributes,
  visualCatalogAttributesSchema,
} from "@/lib/catalog-migration";

/**
 * Unified product type for storefront responses.
 * Used for both product groups and standalone products.
 */
interface UnifiedProduct {
  id: string;
  slug?: string;
  name: string;
  description?: string | null;
  price: number;
  originalPrice: number;
  categoryId: string;
  productGroupId: string | null;
  isGroup: boolean;
  variantCount?: number;
  minPrice?: number;
  maxPrice?: number;
  offerLabel?: string | null;
  hasDiscount?: boolean;
  discountedPrice?: number;
  sku: string;
  createdAt: Date;
  images?: Image[];
  category?: Category;
  design?: Design;
  color?: Color;
  size?: Size;
  reviews?: { rating: number }[];
  supplier?: Supplier | null;
  stock: number;
  isFeatured?: boolean;
}

interface GroupVariantProduct {
  id: string;
  slug: string;
  price: number | Prisma.Decimal;
  stock: number;
  categoryId: string;
  images: Image[];
  category: Category;
  color: Color;
  size: Size;
  design: Design;
}

interface GroupVariant {
  id: string;
  categoryId: string;
  price: number;
  stock: number;
  product: GroupVariantProduct;
}

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
      brand,
      gtin,
      mpn,
      hasNoProductIdentifier,
      description,
      stock,
      images,
      isArchived,
      isFeatured,
      productGroupId,
      isKit, // [NEW]
      components, // [NEW] Array of { componentId, quantity }
      catalogAttributes,
    } = body;
    const normalizedSupplierId =
      typeof supplierId === "string" && supplierId !== "none"
        ? supplierId || null
        : null;
    const normalizedProductGroupId =
      typeof productGroupId === "string" && productGroupId !== "none"
        ? productGroupId || null
        : null;
    const sanitizedDescription = sanitizeRichTextHtml(description);
    const parsedCatalogAttributes = visualCatalogAttributesSchema.parse(
      catalogAttributes ?? [],
    );

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

    let productIdentifiers;
    try {
      productIdentifiers = normalizeProductIdentifiers({
        gtin,
        mpn,
        hasNoProductIdentifier,
      });
    } catch (error) {
      throw ErrorFactory.InvalidRequest(
        error instanceof Error ? error.message : "Identificadores inválidos",
      );
    }

    // [NEW] Validate Kit Data
    if (isKit && (!components || components.length === 0)) {
      throw ErrorFactory.InvalidRequest(
        "Un Kit debe tener productos (componentes).",
      );
    }

    if (normalizedSupplierId) {
      const supplier = await prismadb.supplier.findFirst({
        where: { id: normalizedSupplierId, storeId: params.storeId },
        select: { id: true },
      });
      if (!supplier) throw ErrorFactory.NotFound("Proveedor no encontrado");
    }

    if (normalizedProductGroupId) {
      const productGroup = await prismadb.productGroup.findFirst({
        where: { id: normalizedProductGroupId, storeId: params.storeId },
        select: { id: true },
      });
      if (!productGroup) {
        throw ErrorFactory.NotFound("Grupo de productos no encontrado");
      }
    }

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

    const slug = await getUniqueProductSlug(prismadb, {
      storeId: params.storeId,
      baseSlug: generateProductSlug({ name }),
    });

    let product = await prismadb.product.create({
      data: {
        name,
        slug,
        price,
        acqPrice,
        description: sanitizedDescription,
        stock: 0, // Stock is initialized to 0 and set via INITIAL_INTAKE movement below
        isArchived,
        isFeatured,
        categoryId,
        sizeId,
        colorId,
        designId,
        supplierId: normalizedSupplierId,
        brand: typeof brand === "string" ? brand.trim() || null : null,
        ...productIdentifiers,
        productGroupId: normalizedProductGroupId,
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
        isKit: isKit || false,
        kitComponents: isKit
          ? {
              create: components.map((c: any) => ({
                componentId: c.componentId,
                quantity: c.quantity || 1,
              })),
            }
          : undefined,
      },
    });

    if (parsedCatalogAttributes.length > 0) {
      await prismadb.$transaction((tx) =>
        syncProductCatalogAttributes(tx, {
          storeId: params.storeId,
          productId: product.id,
          categoryId,
          attributes: parsedCatalogAttributes,
        }),
      );
    }

    if (normalizedProductGroupId) {
      await prismadb.$transaction((tx) =>
        synchronizeProductGroupSlugs(
          tx,
          params.storeId,
          normalizedProductGroupId,
        ),
      );
      product = await prismadb.product.findUniqueOrThrow({
        where: { id: product.id },
      });
    }

    // If Kit, calculate initial stock based on components
    if (isKit) {
      const { recalculateKitStock } = await import("@/lib/inventory");
      await recalculateKitStock(prismadb, [product.id]);
    }

    // Create INITIAL_INTAKE movement if stock was provided
    if (stock && stock > 0 && !isKit) {
      // Logic: Kits don't have manual stock intake
      const { createInventoryMovement } = await import("@/lib/inventory");
      await createInventoryMovement(prismadb, {
        productId: product.id,
        storeId: params.storeId,
        type: "INITIAL_INTAKE",
        quantity: stock,
        reason: "Inventario inicial al crear producto",
        cost: acqPrice || undefined,
        createdBy: `USER_${userId}`,
      });
    }

    // Invalidate all product cache entries for this store
    await invalidateStoreProductsCache(params.storeId);

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
    let categoryId = searchParams.get("categoryId")?.split(",") || [];
    const colorId = searchParams.get("colorId")?.split(",") || [];
    const sizeId = searchParams.get("sizeId")?.split(",") || [];
    const designId = searchParams.get("designId")?.split(",") || [];
    const optionValueId =
      searchParams.get("optionValueId")?.split(",").filter(Boolean) || [];
    const isFeatured = searchParams.get("isFeatured");
    const includeSupplier = searchParams.get("includeSupplier") || false;
    const onlyNew = searchParams.get("onlyNew") || undefined;
    const fromShop = searchParams.get("fromShop") || undefined;
    const search = searchParams.get("search") || "";
    const requestedSortOption = searchParams.get("sortOption") || "default";
    const sortOption =
      requestedSortOption === "isOnSale" ||
      Object.prototype.hasOwnProperty.call(SORT_OPTIONS, requestedSortOption)
        ? requestedSortOption
        : "default";
    const excludeProducts = searchParams.get("excludeProducts") || undefined;
    const groupBy = searchParams.get("groupBy"); // "parents"
    const skipCache = searchParams.get("skipCache") === "true";

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
      optionValueId: optionValueId.sort(),
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
      v: "7",
    })}`;

    // Try to get from Redis cache
    try {
      if (!skipCache) {
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
      }
    } catch (error) {
      console.error("Redis get error:", error);
    }

    // Resolve categoryId if provided (supports both UUIDs and Slugs)
    if (categoryId.length > 0) {
      const resolvedCategories = await prismadb.category.findMany({
        where: {
          storeId: params.storeId,
          OR: [{ id: { in: categoryId } }, { slug: { in: categoryId } }],
        },
        select: { id: true },
      });
      if (resolvedCategories.length > 0) {
        categoryId = resolvedCategories.map((c: { id: string }) => c.id);
      }
    }

    // Resolve categories from Type if needed (supports both UUIDs and Slugs)
    let categoriesIds: string[] = [];
    if (typeId.length > 0) {
      const [resolvedTypes, resolvedAliases] = await Promise.all([
        prismadb.type.findMany({
          where: {
            storeId: params.storeId,
            OR: [{ id: { in: typeId } }, { slug: { in: typeId } }],
          },
          select: { id: true },
        }),
        prismadb.typeSlugAlias.findMany({
          where: { storeId: params.storeId, slug: { in: typeId } },
          select: { typeId: true },
        }),
      ]);
      const actualTypeIds = Array.from(
        new Set([
          ...resolvedTypes.map((type) => type.id),
          ...resolvedAliases.map((alias) => alias.typeId),
        ]),
      );
      const categoriesForType = await prismadb.category.findMany({
        where: {
          typeId: { in: actualTypeIds },
          storeId: params.storeId,
        },
        select: { id: true },
      });
      categoriesIds = categoriesForType.map(
        (category: { id: string }) => category.id,
      );
    }

    const selectedOptionValues =
      optionValueId.length > 0
        ? await prismadb.catalogOptionValue.findMany({
            where: {
              storeId: params.storeId,
              id: { in: optionValueId },
            },
            select: { id: true, optionId: true },
          })
        : [];
    const optionValuesByOption = selectedOptionValues.reduce(
      (groups, value) => {
        const values = groups.get(value.optionId) ?? [];
        values.push(value.id);
        groups.set(value.optionId, values);
        return groups;
      },
      new Map<string, string[]>(),
    );
    const catalogOptionConditions: Prisma.ProductWhereInput[] = Array.from(
      optionValuesByOption.entries(),
    ).map(([optionId, valueIds]) => ({
      catalogOptionValues: {
        some: { optionId, optionValueId: { in: valueIds } },
      },
    }));
    if (
      optionValueId.length > 0 &&
      selectedOptionValues.length !== new Set(optionValueId).size
    ) {
      catalogOptionConditions.push({ id: "INVALID_CATALOG_OPTION_VALUE" });
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

    const ids = searchParams.get("ids")?.split(",") || [];

    // ---------------------------------------------------------
    // OPTIMIZED BULK FETCH (BY IDs)
    // ---------------------------------------------------------
    // Used for Cart Validation / Refresh
    // Bypasses heavy filtering to return specific items fast
    if (ids.length > 0) {
      const products = await prismadb.product.findMany({
        where: {
          storeId: params.storeId,
          id: { in: ids },
          isArchived: false,
        },
        include: {
          images: true,
          category: true,
          color: true,
          size: true,
          design: true,
          productGroup: true,
        },
      });

      // Calculate prices/discounts for these specific items
      const pricingMap = await getProductsPrices(
        products.map((p) => ({
          id: p.id,
          categoryId: p.categoryId,
          price: Number(p.price),
          productGroupId: p.productGroupId,
        })),
        params.storeId,
      );

      const response = products.map((item) => {
        const pricing = pricingMap.get(item.id);
        const effectivePrice = pricing?.price ?? Number(item.price);

        return {
          id: item.id,
          slug: item.slug,
          name: item.name,
          price: effectivePrice,
          originalPrice: Number(item.price),
          description: item.description,
          images: item.images,
          category: item.category,
          categoryId: item.categoryId,
          color: item.color,
          size: item.size,
          design: item.design,
          sku: item.sku,
          createdAt: item.createdAt,
          stock: item.stock,
          isGroup: false, // Individual items only for id fetch
          productGroupId: item.productGroupId,
          offerLabel: pricing?.offerLabel ?? null,
          hasDiscount: pricing ? pricing.discount > 0 : false,
          discountedPrice: effectivePrice,
        };
      });

      return NextResponse.json(response, {
        headers: {
          ...CACHE_HEADERS.NO_CACHE, // Always fresh for cart check
          ...corsHeaders,
        },
      });
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
      const shouldScopeGroupVariants = categoryId.length > 0;
      // Filter for Products (used to filter Groups via relation)
      const productFilters: Prisma.ProductWhereInput = {
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
        AND:
          catalogOptionConditions.length > 0
            ? catalogOptionConditions
            : undefined,
        isArchived: false,
        price: priceFilter,
        NOT: {
          id: excludeProducts ? { in: excludeProducts.split(",") } : undefined,
        },
      };

      // Build where clause for Groups
      const baseGroupWhere: Prisma.ProductGroupWhereInput = {
        storeId: params.storeId,
        products: { some: productFilters },
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                {
                  products: {
                    some: {
                      ...productFilters,
                      OR: [{ name: { contains: search } }],
                    },
                  },
                },
              ],
            }
          : {}),
      };

      // Standalone products (productGroupId = null)
      const standaloneWhere: Prisma.ProductWhereInput = {
        ...productFilters,
        productGroupId: null,
        ...(search ? { OR: [{ name: { contains: search } }] } : {}),
      };

      // Fetch ALL groups and products (no pagination at DB level)
      // This is intentional for correct sorting - works well for <500 items
      const [allGroups, allStandaloneProducts] = await Promise.all([
        prismadb.productGroup.findMany({
          where: baseGroupWhere,
          include: {
            images: true,
            products: {
              where: productFilters,
              select: {
                price: true,
                stock: true,
                id: true,
                slug: true,
                category: true,
                categoryId: true,
                colorId: true,
                sizeId: true,
                designId: true,
                images: true,
                color: true,
                size: true,
                design: true,
                isFeatured: true,
                reviews: {
                  select: {
                    rating: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prismadb.product.findMany({
          where: standaloneWhere,
          include: {
            images: true,
            category: true,
            color: true,
            size: true,
            design: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      // Transform groups to unified format
      const transformedGroups: UnifiedProduct[] = allGroups.map((g: any) => {
        const prices = g.products.map((p: any) => Number(p.price));
        const minP = prices.length ? Math.min(...prices) : 0;
        const maxP = prices.length ? Math.max(...prices) : 0;
        const primaryProduct =
          g.products.find((p: any) => p.stock > 0) || g.products[0];
        return {
          id: primaryProduct?.id || g.id,
          productGroupId: g.id,
          slug: primaryProduct?.slug,
          name: g.name,
          description: g.description,
          images: g.images,
          price: minP,
          originalPrice: minP,
          isGroup: true,
          minPrice: minP,
          maxPrice: maxP,
          variantCount: g.products.length,
          category: primaryProduct?.category,
          categoryId: primaryProduct?.categoryId || "",
          reviews: g.products.flatMap((p: any) => p.reviews),
          sku: "GROUP",
          createdAt: g.createdAt,
          stock: g.products.reduce((acc: number, p: any) => acc + p.stock, 0),
          isFeatured: g.products.some((p: any) => p.isFeatured),
        };
      });

      // Transform standalone products to unified format
      const transformedProducts: UnifiedProduct[] = allStandaloneProducts.map(
        (p: any) => ({
          id: p.id,
          slug: p.slug,
          productGroupId: null,
          name: p.name,
          description: p.description,
          images: p.images,
          price: Number(p.price),
          originalPrice: Number(p.price),
          isGroup: false,
          category: p.category,
          categoryId: p.categoryId,
          color: p.color,
          size: p.size,
          design: p.design,
          sku: p.sku,
          createdAt: p.createdAt,
          stock: p.stock,
          isFeatured: p.isFeatured,
        }),
      );

      const merged = [...transformedGroups, ...transformedProducts];

      // ---------------------------------------------------------
      // CALCULATE DISCOUNTS (Batched)
      // ---------------------------------------------------------
      // Collect all variant products for discount calculation
      const allVariantProducts: Array<{
        id: string;
        categoryId: string;
        price: number;
        stock: number;
        productGroupId: string | null;
      }> = [];

      allGroups.forEach((g: any) => {
        allVariantProducts.push(
          ...g.products.map((p: any) => ({
            id: p.id,
            categoryId: p.categoryId,
            price: Number(p.price),
            stock: p.stock,
            productGroupId: g.id,
          })),
        );
      });

      allStandaloneProducts.forEach((p: any) => {
        allVariantProducts.push({
          id: p.id,
          categoryId: p.categoryId,
          price: Number(p.price),
          stock: p.stock,
          productGroupId: null,
        });
      });

      const variantsByGroupId = new Map<string, GroupVariantProduct[]>(
        allGroups.map((group: any) => [group.id, group.products]),
      );

      // Batch calculate prices
      const allPricesMap = await getProductsPrices(
        allVariantProducts,
        params.storeId,
      );

      const pricedItems = merged.map((item) => {
        if (item.isGroup) {
          const productVariants =
            variantsByGroupId.get(item.productGroupId ?? "") ?? [];
          const groupVariants: GroupVariant[] = productVariants.map(
            (variant) => ({
              id: variant.id,
              categoryId: variant.categoryId,
              price: Number(variant.price),
              stock: variant.stock,
              product: variant,
            }),
          );

          if (groupVariants.length > 0) {
            const pricedVariants = groupVariants.map((variant) => {
              const pricing = allPricesMap.get(variant.id);
              return {
                product: variant.product,
                basePrice: variant.price,
                effectivePrice: pricing?.price ?? variant.price,
                hasDiscount: Boolean(pricing && pricing.discount > 0),
                offerLabel: pricing?.offerLabel ?? null,
              };
            });

            const discountedVariants = pricedVariants.filter(
              (variant) => variant.hasDiscount,
            );
            const representativeVariant = [...pricedVariants].sort(
              (first, second) => {
                const priceDifference =
                  first.effectivePrice - second.effectivePrice;
                if (priceDifference !== 0) return priceDifference;

                return (
                  first.product?.slug ??
                  first.product?.id ??
                  ""
                ).localeCompare(
                  second.product?.slug ?? second.product?.id ?? "",
                );
              },
            )[0];
            const minP = Math.min(
              ...pricedVariants.map((variant) => variant.effectivePrice),
            );
            const maxP = Math.max(
              ...pricedVariants.map((variant) => variant.effectivePrice),
            );
            const minBaseP = Math.min(
              ...pricedVariants.map((variant) => variant.basePrice),
            );
            const hasDiscount = discountedVariants.length > 0;

            return {
              ...item,
              id: representativeVariant.product?.id ?? item.id,
              slug: representativeVariant.product?.slug ?? item.slug,
              images:
                item.images && item.images.length > 0
                  ? item.images
                  : (representativeVariant.product?.images ?? []),
              category:
                representativeVariant.product?.category ?? item.category,
              categoryId:
                representativeVariant.product?.categoryId ?? item.categoryId,
              color: representativeVariant.product?.color ?? item.color,
              size: representativeVariant.product?.size ?? item.size,
              design: representativeVariant.product?.design ?? item.design,
              stock: groupVariants.reduce(
                (total, variant) => total + variant.stock,
                0,
              ),
              variantCount: groupVariants.length,
              price: minP,
              originalPrice: minBaseP,
              minPrice: minP,
              maxPrice: maxP,
              offerLabel: representativeVariant.offerLabel,
              hasDiscount,
            };
          }
          return item;
        } else {
          // Standalone product
          const pricing = allPricesMap.get(item.id);
          const effectivePrice = pricing?.price ?? item.price;
          return {
            ...item,
            price: effectivePrice,
            originalPrice: item.originalPrice,
            discountedPrice: effectivePrice,
            offerLabel: pricing?.offerLabel ?? null,
            hasDiscount: pricing ? pricing.discount > 0 : false,
          };
        }
      });

      const itemsMatchingSaleFilter = isOnSale
        ? pricedItems.filter((item) => item.hasDiscount)
        : pricedItems;

      const sortedItems = [...itemsMatchingSaleFilter].sort((first, second) => {
        if (sortOption === "isOnSale") {
          const discountDifference =
            Number(Boolean(second.hasDiscount)) -
            Number(Boolean(first.hasDiscount));
          if (discountDifference !== 0) return discountDifference;
        }

        if (sortOption === "priceLowToHigh") return first.price - second.price;
        if (sortOption === "priceHighToLow") return second.price - first.price;
        if (sortOption === "name")
          return first.name.localeCompare(second.name, "es", {
            sensitivity: "base",
          });
        if (sortOption === "featuredFirst") {
          const featuredDifference =
            Number(Boolean(second.isFeatured)) -
            Number(Boolean(first.isFeatured));
          if (featuredDifference !== 0) return featuredDifference;
        }

        return (
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime()
        );
      });

      totalItems = sortedItems.length;
      totalPages = Math.ceil(totalItems / itemsPerPage);
      const offset = (page - 1) * itemsPerPage;
      const finalResponse = sortedItems.slice(offset, offset + itemsPerPage);

      let groupFacets: ProductFacets | undefined;
      if (shouldScopeGroupVariants) {
        const getFacetWhere = (
          excludedKey: "colorId" | "sizeId" | "categoryId" | "designId",
        ): Prisma.ProductWhereInput => {
          const conditions: Prisma.ProductWhereInput[] = [
            ...catalogOptionConditions,
          ];

          if (search) {
            conditions.push({
              OR: [
                { name: { contains: search } },
                { productGroup: { is: { name: { contains: search } } } },
              ],
            });
          }
          if (isOnSale && onSaleFilter) {
            conditions.push(onSaleFilter);
          }

          return {
            ...productFilters,
            colorId:
              excludedKey === "colorId" ? undefined : productFilters.colorId,
            sizeId:
              excludedKey === "sizeId" ? undefined : productFilters.sizeId,
            categoryId:
              excludedKey === "categoryId"
                ? undefined
                : productFilters.categoryId,
            designId:
              excludedKey === "designId" ? undefined : productFilters.designId,
            ...(conditions.length > 0 ? { AND: conditions } : {}),
          };
        };

        const [colorFacets, sizeFacets, categoryFacets, designFacets] =
          await Promise.all([
            prismadb.product.groupBy({
              by: ["colorId"],
              where: getFacetWhere("colorId"),
              _count: { colorId: true },
            }),
            prismadb.product.groupBy({
              by: ["sizeId"],
              where: getFacetWhere("sizeId"),
              _count: { sizeId: true },
            }),
            prismadb.product.groupBy({
              by: ["categoryId"],
              where: getFacetWhere("categoryId"),
              _count: { categoryId: true },
            }),
            prismadb.product.groupBy({
              by: ["designId"],
              where: getFacetWhere("designId"),
              _count: { designId: true },
            }),
          ]);

        groupFacets = {
          colors: colorFacets.map((facet) => ({
            id: facet.colorId,
            count: facet._count.colorId,
          })),
          formattedSizes: sizeFacets.map((facet) => ({
            id: facet.sizeId,
            count: facet._count.sizeId,
          })),
          categories: categoryFacets.map((facet) => ({
            id: facet.categoryId,
            count: facet._count.categoryId,
          })),
          designs: designFacets.map((facet) => ({
            id: facet.designId,
            count: facet._count.designId,
          })),
        };
      }

      const response = {
        products: finalResponse,
        totalItems,
        totalPages,
        facets: groupFacets,
      };

      // Cache the response
      try {
        if (!skipCache) {
          const { Redis } = await import("@upstash/redis");
          const redisClient = Redis.fromEnv();
          await redisClient.set(cacheKey, response, { ex: 5 * 60 }); // 5 minutes
        }
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
          productGroup: true,
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
        AND:
          catalogOptionConditions.length > 0
            ? catalogOptionConditions
            : undefined,
        OR: search ? [{ name: { contains: search } }] : undefined,
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
        AND: [
          ...catalogOptionConditions,
          onSaleFilter || { id: "NO_MATCH" },
        ],
      };

      // Partition B: Regular Items (NOT in Sale List)
      const whereRegular: Prisma.ProductWhereInput = {
        ...baseProductWhere,
        AND: [
          ...catalogOptionConditions,
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
        colors: colorFacets.map((f: any) => ({
          id: f.colorId,
          count: f._count.colorId,
        })),
        formattedSizes: sizeFacets.map((f: any) => ({
          id: f.sizeId,
          count: f._count.sizeId,
        })),
        categories: categoryFacets.map((f: any) => ({
          id: f.categoryId,
          count: f._count.categoryId,
        })),
        designs: designFacets.map((f: any) => ({
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
        AND:
          catalogOptionConditions.length > 0
            ? catalogOptionConditions
            : undefined,
        OR: [
          { name: search ? { search } : undefined },
          { name: { contains: search } },
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
            productGroup: true,
            supplier: includeSupplier ? true : undefined,
            kitComponents: {
              include: {
                component: {
                  select: { stock: true },
                },
              },
            },
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
        colors: colorFacets.map((f: any) => ({
          id: f.colorId,
          count: f._count.colorId,
        })),
        formattedSizes: sizeFacets.map((f: any) => ({
          id: f.sizeId,
          count: f._count.sizeId,
        })),
        categories: categoryFacets.map((f: any) => ({
          id: f.categoryId,
          count: f._count.categoryId,
        })),
        designs: designFacets.map((f: any) => ({
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

      // Compute effective stock for kit products based on component availability
      let effectiveStock = product.stock;
      if (product.isKit && (product as any).kitComponents?.length > 0) {
        effectiveStock = Math.min(
          ...(product as any).kitComponents.map((c: any) =>
            c.quantity > 0
              ? Math.floor((c.component?.stock || 0) / c.quantity)
              : 0,
          ),
        );
        if (effectiveStock < 0) effectiveStock = 0;
      }

      return {
        ...product,
        stock: effectiveStock,
        price: effectivePrice, // Always effective
        originalPrice: Number(product.price), // Always base
        discountedPrice: effectivePrice,
        offerLabel: pricing?.offerLabel ?? null,
        hasDiscount: pricing ? pricing.discount > 0 : false,
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
      if (!skipCache) {
        const { Redis } = await import("@upstash/redis");
        const redis = Redis.fromEnv();
        const ttl = fromShop ? 5 * 60 : 15 * 60;
        await redis.set(cacheKey, response, { ex: ttl });
      }
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

    await prismadb.$transaction(async (tx: any) => {
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
        (product: any) => product.orderItems.length > 0,
      );
      if (productsWithOrders.length > 0) {
        throw ErrorFactory.Conflict(
          "No se pueden eliminar productos con órdenes asociadas. Elimina o reasigna las órdenes asociadas primero",
          {
            ...parseErrorDetails(
              "productsWithOrders",
              productsWithOrders.map((p: any) => ({ id: p.id, name: p.name })),
            ),
          },
        );
      }

      // Collect image public IDs for deletion
      const publicIds = products.flatMap((product: any) =>
        product.images
          .map((image: any) => getPublicIdFromCloudinaryUrl(image.url))
          .filter((id: any): id is string => id !== null && id !== undefined),
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
    await invalidateStoreProductsCache(params.storeId);

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

    const result = await prismadb.$transaction(async (tx: any) => {
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
    await invalidateStoreProductsCache(params.storeId);

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
