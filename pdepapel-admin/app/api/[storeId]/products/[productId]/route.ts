import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  getPublicIdFromCloudinaryUrl,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");

    const product = await prismadb.product.findUnique({
      where: { id: params.productId },
      include: {
        images: true,
        category: true,
        size: true,
        color: true,
        design: true,
        supplier: true,
        reviews: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!product) {
      throw ErrorFactory.NotFound("Producto no encontrado");
    }

    // Calculate discounted price
    const { calculateDiscountedPrice } = await import("@/lib/discount-engine");
    const productWithDiscount = await calculateDiscountedPrice(
      product,
      params.storeId,
    );

    return NextResponse.json(
      {
        ...product,
        discountedPrice: productWithDiscount.price,
        offerLabel: productWithDiscount.offerLabel,
      },
      {
        headers: CACHE_HEADERS.DYNAMIC,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_GET", {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");

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
      throw ErrorFactory.InvalidRequest("El nombre del producto es requerido");
    if (!images || !images.length)
      throw ErrorFactory.InvalidRequest(
        "Las imágenes del producto son requeridas",
      );
    if (!price)
      throw ErrorFactory.InvalidRequest("El precio del producto es requerido");
    if (!categoryId)
      throw ErrorFactory.InvalidRequest(
        "La categoría del producto es requerida",
      );
    if (!sizeId)
      throw ErrorFactory.InvalidRequest("El tamaño del producto es requerido");
    if (!colorId)
      throw ErrorFactory.InvalidRequest("El color del producto es requerido");
    if (!designId)
      throw ErrorFactory.InvalidRequest("El diseño del producto es requerido");
    if (stock && stock < 0)
      throw ErrorFactory.InvalidRequest(
        "El stock del producto debe ser cero o mayor a cero",
      );

    const productToUpdate = await prismadb.product.findUnique({
      where: { id: params.productId, storeId: params.storeId },
      include: { images: true },
    });

    if (!productToUpdate)
      throw ErrorFactory.NotFound(
        `El Producto ${params.productId} no existe en esta tienda`,
      );

    const currentImageUrls = productToUpdate.images.map((image) => image.url);
    const newImageUrls = images.map((image: { url: string }) => image.url);
    const imagesToDelete = currentImageUrls.filter(
      (url) => !newImageUrls.includes(url),
    );

    const result = await prismadb.$transaction(async (tx) => {
      // Delete old images from Cloudinary
      if (imagesToDelete.length > 0) {
        const publicIds = imagesToDelete
          .map((url) => getPublicIdFromCloudinaryUrl(url))
          .filter((id): id is string => id !== null);

        try {
          if (publicIds.length > 0) {
            await cloudinaryInstance.v2.api.delete_resources(publicIds, {
              type: "upload",
              resource_type: "image",
            });
          }
        } catch (cloudinaryError: any) {
          throw ErrorFactory.CloudinaryError(
            cloudinaryError,
            "Error al intentar eliminar las imágenes del servidor Cloudinary",
          );
        }
      }

      // Update product
      await tx.product.update({
        where: { id: params.productId },
        data: {
          name,
          price,
          acqPrice,
          categoryId,
          colorId,
          sizeId,
          designId,
          supplierId,
          isArchived,
          isFeatured,
          stock,
          description,
          images: {
            deleteMany: {},
          },
        },
      });

      // Create new images
      return await tx.product.update({
        where: { id: params.productId },
        data: {
          images: {
            createMany: {
              data: images.map((image: { url: string; isMain?: boolean }) => ({
                url: image.url,
                isMain: image.isMain ?? false,
              })),
            },
          },
        },
      });
    });

    // Invalidate all product cache entries for this store
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      const pattern = `store:${params.storeId}:products:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error("Redis cache invalidation error:", error);
    }

    return NextResponse.json(result, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const product = await prismadb.product.findUnique({
        where: { id: params.productId, storeId: params.storeId },
        include: {
          images: true,
          orderItems: true,
        },
      });

      if (!product)
        throw ErrorFactory.NotFound(
          `El Producto ${params.productId} no existe en esta tienda`,
        );

      const productWithOrders = product.orderItems.length > 0;
      if (productWithOrders) {
        throw ErrorFactory.Conflict(
          `No se puede eliminar el producto ${product.name} porque tiene ${product.orderItems.length} órdenes asociadas. Elimina o reasigna las órdenes asociadas primero`,
          {
            product: product.name,
            orders: product.orderItems.map((order) => order.orderId).join(", "),
          },
        );
      }

      // Delete images from Cloudinary
      const publicIds = product.images
        .map((image) => getPublicIdFromCloudinaryUrl(image.url))
        .filter((id): id is string => id !== null);

      if (publicIds.length > 0) {
        try {
          await cloudinaryInstance.v2.api.delete_resources(publicIds, {
            type: "upload",
            resource_type: "image",
          });
        } catch (cloudinaryError: any) {
          throw ErrorFactory.CloudinaryError(
            cloudinaryError,
            "Error al eliminar imágenes del producto del servidor Cloudinary",
          );
        }
      }

      // Delete related records first
      await tx.review.deleteMany({
        where: { productId: params.productId, storeId: params.storeId },
      });

      await tx.image.deleteMany({
        where: { productId: params.productId },
      });

      // Finally delete the product
      await tx.product.delete({
        where: { id: params.productId, storeId: params.storeId },
      });
    });

    // Invalidate all product cache entries for this store
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      const pattern = `store:${params.storeId}:products:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error("Redis cache invalidation error:", error);
    }

    return NextResponse.json("El producto ha sido eliminado correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
