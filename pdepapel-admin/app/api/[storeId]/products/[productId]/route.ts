import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import cloudinaryInstance from "@/lib/cloudinary";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  getPublicIdFromCloudinaryUrl,
  verifyStoreOwner,
  generateRandomSKU,
} from "@/lib/utils";
import { generateSemanticSKU } from "@/lib/variant-generator";
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
        // [NEW] Include kit components
        kitComponents: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                stock: true,
                images: { where: { isMain: true } },
                sku: true, // Useful for reference
              },
            },
          },
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
        price: productWithDiscount.price, // EFFECTIVE PRICE
        originalPrice: product.price, // BASE PRICE
        discountedPrice: productWithDiscount.price, // Alias
        offerLabel: productWithDiscount.offerLabel,
        hasDiscount: productWithDiscount.discount > 0,
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
      productGroupId,

      isKit,
      components,
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

    // [NEW] Validate Kit Data
    if (isKit && (!components || components.length === 0)) {
      throw ErrorFactory.InvalidRequest(
        "Un Kit debe tener productos (componentes).",
      );
    }

    const productToUpdate = await prismadb.product.findUnique({
      where: { id: params.productId, storeId: params.storeId },
      include: { images: true },
    });

    if (!productToUpdate)
      throw ErrorFactory.NotFound(
        `El Producto ${params.productId} no existe en esta tienda`,
      );

    // SKU Regeneration for Manual Items
    let newSku: string | undefined = undefined;
    if (productToUpdate.sku.startsWith("MAN-")) {
      const [category, design, color, size] = await Promise.all([
        prismadb.category.findUnique({ where: { id: categoryId } }),
        prismadb.design.findUnique({ where: { id: designId } }),
        prismadb.color.findUnique({ where: { id: colorId } }),
        prismadb.size.findUnique({ where: { id: sizeId } }),
      ]);

      if (category && design && color && size) {
        newSku = generateSemanticSKU(
          category.name,
          design.name,
          color.name,
          size.value || size.name,
        );
      }
    }

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
          ...(newSku && { sku: newSku }),
          price,
          acqPrice,
          categoryId,
          colorId,
          sizeId,
          designId,
          supplierId,
          isArchived,
          isFeatured,
          productGroupId: productGroupId || null,
          description,
          images: {
            deleteMany: {},
          },
          // [NEW] Update Kit info
          isKit: isKit || false,
          kitComponents: isKit
            ? {
                deleteMany: {}, // Wipe old
                create: components.map((c: any) => ({
                  componentId: c.componentId,
                  quantity: c.quantity || 1,
                })),
              }
            : undefined,
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

      // Calculate Stock for Kit after update
      // We can't await inside the return easily for the result, so we just run it.
      // But we are in a transaction.
      // Actually we need to wait for this update to finish before calculating stock?
      // No, we are in transaction 'tx'. We can recalculate using 'tx'.
    });

    // Perform Recalculation OUTSIDE transaction (or inside if we used tx)
    // To play safe with imports and async, we do it after result.
    if (isKit) {
      const { recalculateKitStock } = await import("@/lib/inventory");
      await recalculateKitStock(prismadb, [params.productId]);
    }

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
