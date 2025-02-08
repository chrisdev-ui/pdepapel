import {
  PRICE_RANGES,
  PriceRanges,
  SORT_OPTIONS,
  SortOption,
} from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import {
  generateRandomSKU,
  getPublicIdFromCloudinaryUrl,
  parseErrorDetails,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

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

    return NextResponse.json(product);
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_POST");
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
    return handleErrorResponse(error, "PRODUCTS_GET");
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

    const result = await prismadb.$transaction(async (tx) => {
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

      const deletedProducts = await tx.product.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      return {
        deletedProducts,
        deletedImages: publicIds,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_DELETE");
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

    return NextResponse.json(result);
  } catch (error) {
    return handleErrorResponse(error, "PRODUCTS_PATCH");
  }
}
