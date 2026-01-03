import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";

import { CACHE_HEADERS, getPublicIdFromCloudinaryUrl } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/db-utils";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import cloudinaryInstance from "@/lib/cloudinary";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; productGroupId: string } },
) {
  try {
    if (!params.productGroupId) {
      throw ErrorFactory.InvalidRequest("Product Group ID is required");
    }

    const productGroup = await prismadb.productGroup.findUnique({
      where: {
        id: params.productGroupId,
      },
      include: {
        images: true,
        products: {
          include: {
            images: true,
            color: true,
            size: true,
            design: true,
          },
        },
      },
    });

    if (!productGroup) throw ErrorFactory.NotFound("Product Group not found");

    return NextResponse.json(productGroup, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_GROUP_GET", {
      headers: corsHeaders,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; productGroupId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const {
      name,
      description,
      images,
      imageMapping,
      defaultPrice,
      defaultCost,
      defaultStock,
      defaultSupplier,
      isFeatured,
      categoryId,
      variants: variantsPayload,
    } = body;

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productGroupId)
      throw ErrorFactory.InvalidRequest("Product Group ID is required");

    if (!name) throw ErrorFactory.InvalidRequest("Name is required");
    if (!images || !images.length)
      throw ErrorFactory.InvalidRequest("Images are required");
    if (!variantsPayload || !Array.isArray(variantsPayload)) {
      throw ErrorFactory.InvalidRequest("Variants array is required");
    }

    await verifyStoreOwner(userId, params.storeId);

    const updatedGroup = await prismadb.$transaction(async (tx) => {
      const initialMovements: any[] = [];
      // 1. Update Group Details
      const groupData: any = {
        name,
        description,
        images: {
          deleteMany: {},
          createMany: {
            data: [
              ...images.map((image: { url: string }) => ({
                url: image.url,
                isMain: true,
              })),
            ],
          },
        },
      };

      const group = await tx.productGroup.update({
        where: { id: params.productGroupId },
        data: groupData,
      });

      // 2. Fetch Existing Variants to Handle Deletions
      const existingProducts = await tx.product.findMany({
        where: { productGroupId: params.productGroupId },
        include: { orderItems: true },
      });

      // 3. Identify Variants to Update, Create, and Delete
      const payloadIds = new Set(
        variantsPayload.map((v: any) => v.id).filter(Boolean),
      );

      // Deletions: Existing products not present in the payload
      const productsToDelete = existingProducts.filter(
        (p) => !payloadIds.has(p.id),
      );

      // Process Deletions
      for (const product of productsToDelete) {
        if (product.orderItems.length > 0) {
          // Soft delete if orders exist
          await tx.product.update({
            where: { id: product.id },
            data: { isArchived: true },
          });
        } else {
          // Hard delete
          await tx.product.delete({
            where: { id: product.id },
          });
        }
      }

      // 4. Process Upserts (Updates + Creations)
      await Promise.all(
        variantsPayload.map(async (variant: any) => {
          const sizeId = variant.size?.id || variant.sizeId;
          const colorId = variant.color?.id || variant.colorId;
          const designId = variant.design?.id || variant.designId;

          // Determine Image Logic
          let applicableImages: { url: string }[] = [];

          // 1. Check for Explicit Images (Manual Override from Variant Grid)
          if (variant.images && variant.images.length > 0) {
            applicableImages = variant.images.map((url: string) => ({ url }));
          } else {
            // 2. Fallback to Smart Mapping
            applicableImages = images.filter((img: { url: string }) => {
              const mapping = imageMapping?.find((m: any) => m.url === img.url);
              if (!mapping || mapping.scope === "all") return true;

              if (mapping.scope.startsWith("COMBO|")) {
                const [, cId, dId] = mapping.scope.split("|");
                return colorId === cId && designId === dId;
              }

              return mapping.scope === colorId || mapping.scope === designId;
            });
          }

          // Prepare Data
          const finalPrice =
            variant.price !== undefined
              ? parseFloat(variant.price)
              : parseFloat(defaultPrice || "0");
          const finalAcqPrice =
            variant.acqPrice !== undefined
              ? parseFloat(variant.acqPrice)
              : parseFloat(defaultCost || "0");
          const finalStock =
            variant.stock !== undefined
              ? parseInt(variant.stock)
              : parseInt(defaultStock || "0");
          const finalSupplierId = variant.supplierId || defaultSupplier || null;

          const dataToUpsert = {
            storeId: params.storeId,
            productGroupId: params.productGroupId,
            categoryId, // Update category if provided
            sizeId,
            colorId,
            designId,
            name: variant.name || name,
            sku: variant.sku,
            description: variant.description || description || "",
            price: finalPrice,
            acqPrice: finalAcqPrice,
            stock: variant.id && payloadIds.has(variant.id) ? undefined : 0,
            supplierId: finalSupplierId,
            isFeatured: variant.isFeatured ?? isFeatured ?? false,
            isArchived: variant.isArchived || false,
            images: {
              deleteMany: {}, // Clear old images for this specific product
              createMany: {
                data: applicableImages.map(
                  (img: { url: string; isMain?: boolean }) => ({
                    url: img.url,
                    isMain: img.isMain || false,
                  }),
                ),
              },
            },
          };

          if (variant.id && payloadIds.has(variant.id)) {
            // UPDATE Existing
            await tx.product.update({
              where: { id: variant.id },
              data: dataToUpsert,
            });
          } else {
            // CREATE New
            const newProduct = await tx.product.create({
              data: dataToUpsert,
            });

            if (finalStock > 0 && !dataToUpsert.stock) {
              // Logic: dataToUpsert.stock is 0 for new items (line 206).
              // So if finalStock (payload) > 0, we add movement.
              initialMovements.push({
                storeId: params.storeId,
                productId: newProduct.id,
                type: "INITIAL_INTAKE",
                quantity: finalStock,
                cost: finalAcqPrice,
                price: finalPrice,
                createdBy: userId,
                reason: "Initial stock from Product Group update (new variant)",
              });
            }
          }
        }),
      );

      // Execute Initial Movements
      if (initialMovements.length > 0) {
        const { createInventoryMovementBatch } = await import(
          "@/lib/inventory"
        );
        await createInventoryMovementBatch(tx, initialMovements);
      }

      return group;
    });

    // Invalidate Cache
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

    return NextResponse.json(updatedGroup, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_GROUP_PATCH]", error);
    return handleErrorResponse(error, "PRODUCT_GROUP_PATCH", {
      headers: corsHeaders,
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; productGroupId: string } },
) {
  try {
    const { userId } = auth();
    // Parse query params for delete mode
    const url = new URL(req.url);
    const deleteVariants = url.searchParams.get("deleteVariants") === "true";

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productGroupId)
      throw ErrorFactory.InvalidRequest("Product Group ID is required");

    await verifyStoreOwner(userId, params.storeId);

    const deletedGroup = await prismadb.$transaction(async (tx) => {
      // 1. Fetch children to check constraints
      const children = await tx.product.findMany({
        where: { productGroupId: params.productGroupId },
        include: { orderItems: true },
      });

      if (deleteVariants) {
        // Enforce Strict Policy: Cannot delete if ANY child has orders
        const hasOrders = children.some((child) => child.orderItems.length > 0);
        if (hasOrders) {
          throw ErrorFactory.Conflict(
            "Cannot delete group and variants because some products have existing orders.",
          );
        }

        // Delete children images first (Cloudinary cleanup usually handled via separate cleanup job or detailed logic)
        // ideally we should delete images too, but that requires calling external service which might fail transaction.
        // For now, we delete DB records. The cleanup job handles orphaned images.

        // Delete children
        await tx.product.deleteMany({
          where: { productGroupId: params.productGroupId },
        });
      } else {
        // Default: Unlink
        await tx.product.updateMany({
          where: {
            productGroupId: params.productGroupId,
          },
          data: {
            productGroupId: null,
          },
        });
      }

      // 2. Delete Group
      return tx.productGroup.delete({
        where: {
          id: params.productGroupId,
        },
      });
    });

    // Invalidate Cache
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

    return NextResponse.json(deletedGroup, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_GROUP_DELETE]", error);
    return handleErrorResponse(error, "PRODUCT_GROUP_DELETE", {
      headers: corsHeaders,
    });
  }
}
