import { PRICE_RANGES, SORT_OPTIONS } from "@/constants";
import prismadb from "@/lib/prismadb";
import {
  ParsedQueryParams,
  PriceRanges,
  ProductBody,
  ProductIncludeOptions,
  SortOption,
} from "@/lib/types";
import { Image, Prisma, Product } from "@prisma/client";
import { deleteResources, getPublicId } from "./cloudinary";

/**
 * Creates a new product with the given data.
 * @param data - The product data including SKU and store ID.
 * @returns A prisma promise that resolves to the created product.
 */
export function createProduct(
  data: ProductBody & { sku: string; storeId: string },
): Promise<Product> {
  return prismadb.product.create({
    data: {
      ...data,
      images: {
        createMany: {
          data: [...data.images.map((image) => image)],
        },
      },
    },
  });
}

/**
 * Creates a new product with the given data.
 * @param data - The product data including SKU and store ID.
 * @returns A promise that resolves to the created product.
 */
export async function createNewProduct(
  data: ProductBody & { sku: string; storeId: string },
): Promise<Product> {
  return await createProduct(data);
}

/**
 * Parses the query parameters from a URL and returns an object containing the parsed values.
 * @param url - The URL string to parse.
 * @returns An object containing the parsed query parameters.
 */
export function parseQueryParams(url: string): ParsedQueryParams {
  const { searchParams } = new URL(url);

  return {
    page: Number(searchParams.get("page")) || 1,
    itemsPerPage: Number(searchParams.get("itemsPerPage")) || 52,
    typeId: searchParams.get("typeId")?.split(",") || [],
    categoryId: searchParams.get("categoryId")?.split(",") || [],
    colorId: searchParams.get("colorId")?.split(",") || [],
    sizeId: searchParams.get("sizeId")?.split(",") || [],
    designId: searchParams.get("designId")?.split(",") || [],
    isFeatured: Boolean(searchParams.get("isFeatured")) || false,
    onlyNew: Boolean(searchParams.get("onlyNew")) || false,
    fromShop: Boolean(searchParams.get("fromShop")) || false,
    limit: Number(searchParams.get("limit")) || undefined,
    sortOption: searchParams.get("sortOption") || "default",
    priceRange: searchParams.get("priceRange") || undefined,
    excludeProducts: searchParams.get("excludeProducts") || undefined,
    search: searchParams.get("search") || "",
  };
}

/**
 * Builds a product query based on the provided query parameters and store ID.
 * @param queryParams - The parsed query parameters.
 * @param storeId - The ID of the store.
 * @returns The product query object.
 */
export async function buildProductQuery(
  queryParams: ParsedQueryParams,
  storeId: string,
) {
  let categoriesIds: string[] = [];
  if (queryParams.typeId.length > 0) {
    const categoriesForType = await prismadb.category.findMany({
      where: {
        typeId: { in: queryParams.typeId },
        storeId,
      },
      select: {
        id: true,
      },
    });
    categoriesIds = categoriesForType.map((category) => category.id);
  }

  const {
    categoryId,
    colorId,
    sizeId,
    designId,
    isFeatured,
    priceRange,
    excludeProducts,
    sortOption,
    fromShop,
    page,
    itemsPerPage,
    limit,
    onlyNew,
    search,
  } = queryParams;

  const where = onlyNew
    ? {
        storeId,
        isArchived: false,
      }
    : {
        storeId,
        categoryId:
          categoryId.length > 0
            ? { in: categoryId }
            : categoriesIds.length > 0
              ? { in: categoriesIds }
              : undefined,
        colorId: colorId.length > 0 ? { in: colorId } : undefined,
        sizeId: sizeId.length > 0 ? { in: sizeId } : undefined,
        designId: designId.length > 0 ? { in: designId } : undefined,
        isFeatured,
        isArchived: false,
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
        price: priceRange ? PRICE_RANGES[priceRange as PriceRanges] : undefined,
        NOT: {
          id: excludeProducts ? { in: excludeProducts.split(",") } : undefined,
        },
      };

  const include: Prisma.ProductInclude = {
    images: true,
    category: true,
    color: true,
    design: true,
    size: true,
    reviews: {
      orderBy: { createdAt: "desc" },
    },
  };

  const orderBy: Prisma.ProductOrderByWithRelationAndSearchRelevanceInput =
    onlyNew
      ? {
          createdAt: "desc",
        }
      : SORT_OPTIONS[sortOption as SortOption];

  const skip = onlyNew
    ? undefined
    : fromShop
      ? (page - 1) * itemsPerPage
      : undefined;

  const take = onlyNew
    ? limit || undefined
    : limit || (fromShop ? itemsPerPage : undefined);

  return {
    where,
    include,
    orderBy,
    skip,
    take,
  };
}

/**
 * Fetches filtered products based on the provided query parameters and store ID.
 * @param queryParams - The parsed query parameters used to filter the products.
 * @param storeId - The ID of the store.
 * @returns An object containing the filtered products and the total number of items.
 */
export async function fetchFilteredProducts(
  queryParams: ParsedQueryParams,
  storeId: string,
) {
  const query = await buildProductQuery(queryParams, storeId);
  const products = await prismadb.product.findMany({
    where: query.where,
    include: query.include,
    orderBy: query.orderBy,
    skip: query.skip,
    take: query.take,
  });
  const totalItems = await prismadb.product.count({
    where: query.where,
    take: queryParams.onlyNew ? query.take : undefined,
  });
  return {
    products,
    totalItems,
  };
}

/**
 * Retrieves the total number of products for a given store ID.
 * @param storeId - The ID of the store.
 * @returns A promise that resolves to the total number of products.
 */
export async function getTotalProductsByStoreId(storeId: string) {
  return await prismadb.product.count({
    where: { storeId, isArchived: false },
  });
}

/**
 * Retrieves a product by its ID.
 * @param productId - The ID of the product.
 * @param includeOptions - Options to specify which related entities to include.
 * @param includeAll - Whether to include all related entities.
 * @returns A promise that resolves to the product with the specified ID.
 */
export async function getProductById(
  productId: string,
  includeOptions: ProductIncludeOptions = {},
  includeAll: boolean = false,
) {
  const include: Prisma.ProductInclude = {};

  if (includeAll) {
    include.category = true;
    include.size = true;
    include.color = true;
    include.design = true;
    include.reviews = {
      orderBy: { createdAt: "desc" },
    };
  } else {
    if (includeOptions.images) {
      include.images = true;
    }

    if (includeOptions.category) {
      include.category = true;
    }

    if (includeOptions.size) {
      include.size = true;
    }

    if (includeOptions.color) {
      include.color = true;
    }

    if (includeOptions.design) {
      include.design = true;
    }

    if (includeOptions.reviews) {
      include.reviews = {
        orderBy: { createdAt: "desc" },
      };
    }
  }

  return await prismadb.product.findUnique({
    where: { id: productId },
    include,
  });
}

export async function updateProductById(
  productId: string,
  data: ProductBody,
  productImages: Image[],
) {
  return prismadb.$transaction(async (tx) => {
    const { images, ...bodyWithoutImages } = data;

    // 1. Find images to delete
    const currentImageUrls = productImages.map((image) => image.url);
    const newImageUrls = images.map((image) => image.url);
    const imagesToDelete = currentImageUrls.filter(
      (url) => !newImageUrls.includes(url),
    );

    // 2. Find images to add
    const imagesToAdd = newImageUrls.filter(
      (url) => !currentImageUrls.includes(url),
    );

    // 3. Delete unnecessary images
    if (imagesToDelete.length > 0) {
      const publicIdsToDelete = imagesToDelete.map(
        (url) => getPublicId(url) ?? "",
      );
      await deleteResources(publicIdsToDelete);
      await tx.image.deleteMany({
        where: {
          productId,
          url: { in: imagesToDelete },
        },
      });
    }

    // 4. Add new images
    if (imagesToAdd.length > 0) {
      const imagesToCreate = imagesToAdd.map((url) => ({
        url,
        productId,
      }));
      await tx.image.createMany({
        data: imagesToCreate,
      });
    }

    // 5. Update product excluding images
    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: bodyWithoutImages,
    });

    return updatedProduct;
  });
}

/**
 * Deletes a product by its ID.
 * @param productId - The ID of the product to delete.
 * @returns A promise that resolves when the product is deleted.
 */
export async function deleteProductById(productId: string): Promise<void> {
  await prismadb.product.delete({ where: { id: productId } });
}

/**
 * Fetches products and their variants based on the provided order items.
 *
 * @param orderItems - An array of objects containing the product ID, variant ID, and optional quantity.
 * @returns A promise that resolves to an array of products and their variants.
 */
export async function fetchProductsAndVariants(
  orderItems: { productId: string; variantId: string; quantity?: number }[],
) {
  const productIds = orderItems.map((item) => item.productId);
  const variantIds = orderItems.map((item) => item.variantId);

  const products = await prismadb.product.findMany({
    where: {
      id: { in: productIds },
    },
    include: {
      variants: {
        where: {
          id: { in: variantIds },
        },
        include: {
          discount: true,
          inventory: true,
        },
      },
    },
  });

  return products;
}

export async function searchProductsByTerm(
  term: string,
  storeId: string,
  limit: number,
) {
  return await prismadb.product.findMany({
    where: {
      storeId,
      isArchived: false,
      OR: [
        {
          name: term ? { search: term } : undefined,
        },
        {
          description: term ? { search: term } : undefined,
        },
        {
          name: {
            contains: term,
          },
        },
        {
          description: {
            contains: term,
          },
        },
      ],
    },
    orderBy: {
      _relevance: {
        fields: ["name", "description"],
        search: term,
        sort: "asc",
      },
    },
    take: limit,
    include: {
      images: true,
    },
  });
}
