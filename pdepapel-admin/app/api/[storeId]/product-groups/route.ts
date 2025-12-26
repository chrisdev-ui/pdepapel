import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    const body = await req.json();

    const {
      name,
      description,
      images,
      imageMapping, // { url: string, scope: string }[]
      categoryId,
      defaultPrice,
      defaultStock,
      defaultSupplier,
      isFeatured,
      variants: variantsPayload, // Array of manually created/edited variants
    } = body;

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    if (!name) throw ErrorFactory.InvalidRequest("Name is required");
    if (!categoryId) throw ErrorFactory.InvalidRequest("Category is required");
    if (!images || !images.length)
      throw ErrorFactory.InvalidRequest("Images are required");
    if (!defaultPrice)
      throw ErrorFactory.InvalidRequest("Default price is required");
    if (!variantsPayload || !variantsPayload.length) {
      throw ErrorFactory.InvalidRequest("Variants are required");
    }

    const productGroup = await prismadb.$transaction(async (tx) => {
      // 1. Create Product Group
      const group = await tx.productGroup.create({
        data: {
          storeId: params.storeId,
          name,
          description: description || "",
          images: {
            createMany: {
              data: [
                ...images.map((image: { url: string }) => ({
                  url: image.url,
                  isMain: true,
                })),
              ],
            },
          },
        },
      });

      // 2. Create Products from Frontend Variants
      await Promise.all(
        variantsPayload.map(async (variant: any) => {
          // Extract IDs from potentially nested objects (size: { id: ... } or sizeId: ...)
          const sizeId = variant.size?.id || variant.sizeId;
          const colorId = variant.color?.id || variant.colorId;
          const designId = variant.design?.id || variant.designId;

          if (!sizeId || !colorId || !designId) {
            // Skip invalid variants (though validation should handle this)
            return;
          }

          // Determine Applicable Images
          let applicableImages: { url: string }[] = [];

          // 1. Check for Explicit Images (Manual Override from Variant Grid)
          if (variant.images && variant.images.length > 0) {
            applicableImages = variant.images.map((url: string) => ({ url }));
          } else {
            // 2. Fallback to Smart Mapping
            applicableImages = images.filter((img: { url: string }) => {
              const mapping = imageMapping?.find((m: any) => m.url === img.url);
              // Default to 'all' if no mapping found, or explicit 'all'
              if (!mapping || mapping.scope === "all") return true;

              if (mapping.scope.startsWith("COMBO|")) {
                const [, cId, dId] = mapping.scope.split("|");
                return colorId === cId && designId === dId;
              }

              // Single Attribute Match (Color or Design)
              return mapping.scope === colorId || mapping.scope === designId;
            });
          }

          const finalPrice =
            variant.price !== undefined
              ? parseFloat(variant.price)
              : parseFloat(defaultPrice);
          const finalAcqPrice =
            variant.acqPrice !== undefined ? parseFloat(variant.acqPrice) : 0;
          const finalStock =
            variant.stock !== undefined
              ? parseInt(variant.stock)
              : parseInt(defaultStock || "0");

          const finalSupplierId = variant.supplierId || defaultSupplier;

          await tx.product.create({
            data: {
              storeId: params.storeId,
              productGroupId: group.id,
              categoryId,
              name: variant.name || name, // Fallback to group name if variant name missing
              sku: variant.sku,
              description: variant.description || description || "",
              price: finalPrice,
              acqPrice: finalAcqPrice,
              stock: finalStock,
              supplierId: finalSupplierId || null,
              sizeId,
              colorId,
              designId,
              isFeatured: variant.isFeatured ?? isFeatured ?? false,
              isArchived: variant.isArchived || false,
              images: {
                createMany: {
                  data: applicableImages.map(
                    (img: { url: string; isMain?: boolean }) => ({
                      url: img.url,
                      isMain: img.isMain || false,
                    }),
                  ),
                },
              },
            },
          });
        }),
      );

      return group;
    });

    return NextResponse.json(productGroup, { headers: corsHeaders });
  } catch (error) {
    console.log("[PRODUCT_GROUPS_POST]", error);
    return handleErrorResponse(error, "PRODUCT_GROUPS_POST", {
      headers: corsHeaders,
    });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    // Allow public access? Or admin only? Usually admin only for groups management
    // But store-front might need it (via the new groupBy param on products route)
    // This specific route is likely for ADMIN management list.
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    // For admin dashboard list
    const productGroups = await prismadb.productGroup.findMany({
      where: {
        storeId: params.storeId,
      },
      include: {
        products: true, // Includes variant count
        images: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(productGroups, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_GROUPS_GET", {
      headers: corsHeaders,
    });
  }
}
