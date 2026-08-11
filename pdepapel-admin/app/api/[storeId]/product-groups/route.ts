import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { generateProductSlug, slugify } from "@/lib/slugify";
import { synchronizeProductGroupSlugs } from "@/lib/product-slugs";
import { sanitizeRichTextHtml } from "@/lib/rich-text";
import { verifyStoreOwner } from "@/lib/utils";
import { hasDuplicateVariantCombination } from "@/lib/variant-combinations";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";

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
      brand,
      description,
      images,
      imageMapping, // { url: string, scope: string }[]
      categoryId,
      defaultPrice,
      price, // Alias for defaultPrice
      defaultStock,
      defaultSupplier,
      defaultCost,
      acqPrice, // Alias for defaultCost
      isFeatured,
      variants: variantsPayload, // Array of manually created/edited variants
    } = body;

    const effectiveDefaultPrice = defaultPrice ?? price;
    const effectiveDefaultCost = defaultCost ?? acqPrice;
    const sanitizedDescription = sanitizeRichTextHtml(description);

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    if (!name) throw ErrorFactory.InvalidRequest("Name is required");
    if (!categoryId) throw ErrorFactory.InvalidRequest("Category is required");
    if (!images || !images.length)
      throw ErrorFactory.InvalidRequest("Images are required");
    if (!effectiveDefaultPrice)
      throw ErrorFactory.InvalidRequest("Default price is required");
    if (!variantsPayload || !variantsPayload.length) {
      throw ErrorFactory.InvalidRequest("Variants are required");
    }
    if (hasDuplicateVariantCombination(variantsPayload)) {
      throw ErrorFactory.InvalidRequest(
        "No se pueden crear dos variantes con la misma combinación de tamaño, color y diseño.",
      );
    }

    const productGroup = await prismadb.$transaction(async (tx) => {
      const initialMovements: any[] = [];
      // 1. Create Product Group
      const group = await tx.productGroup.create({
        data: {
          storeId: params.storeId,
          name,
          brand: typeof brand === "string" ? brand.trim() || null : null,
          slug: slugify(name),
          description: sanitizedDescription,
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
        },
      });

      // 2. Create/Update Products from Frontend Variants
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

          const [colorObj, designObj, sizeObj] = await Promise.all([
            tx.color.findUnique({ where: { id: colorId } }),
            tx.design.findUnique({ where: { id: designId } }),
            tx.size.findUnique({ where: { id: sizeId } }),
          ]);

          const variantName = variant.name || name;
          let variantSlug = generateProductSlug({
            name: variantName,
            color: colorObj,
            design: designObj,
            size: sizeObj,
            includeVariantAttributes: variantsPayload.length > 1,
          });
          if (!variantSlug)
            variantSlug = slugify(variantName) || `variant-${Date.now()}`;

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

              if (mapping.scope.startsWith("COLOR|")) {
                const [, cId] = mapping.scope.split("|");
                return colorId === cId;
              }

              if (mapping.scope.startsWith("DESIGN|")) {
                const [, dId] = mapping.scope.split("|");
                return designId === dId;
              }

              return true;
            });
          }

          const finalPrice =
            variant.price !== undefined
              ? parseFloat(variant.price)
              : parseFloat(effectiveDefaultPrice);
          const finalAcqPrice =
            variant.acqPrice !== undefined
              ? parseFloat(variant.acqPrice)
              : effectiveDefaultCost
                ? parseFloat(effectiveDefaultCost)
                : null;
          const finalStock =
            variant.stock !== undefined
              ? parseInt(variant.stock)
              : parseInt(defaultStock || "0");

          const finalSupplierId = variant.supplierId || defaultSupplier;

          const productData = {
            storeId: params.storeId,
            productGroupId: group.id,
            categoryId,
            name: variantName,
            slug: variantSlug,
            sku: variant.sku,
            description: sanitizeRichTextHtml(
              variant.description || sanitizedDescription,
            ),
            price: finalPrice,
            acqPrice: finalAcqPrice,
            stock: finalStock,
            supplierId: finalSupplierId || null,
            sizeId,
            colorId,
            designId,
            isFeatured: variant.isFeatured ?? isFeatured ?? false,
            isArchived: variant.isArchived || false,
            // Handle images carefully during update vs create?
            // For now, simpler to always recreate images or upsert
          };

          if (variant.id) {
            // ADOPT EXISTING PRODUCT
            // CRITICAL: Do NOT update stock for adopted products - they already have inventory.
            // We only update the productGroupId, category, pricing, and metadata.
            // Stock should remain unchanged to preserve inventory integrity.
            const { stock: _excludedStock, ...productDataWithoutStock } =
              productData;

            await tx.product.update({
              where: { id: variant.id, storeId: params.storeId },
              data: productDataWithoutStock,
            });

            // Prisma 6: explicit image replacement for optional relations
            await tx.image.deleteMany({
              where: { productId: variant.id },
            });
            await tx.image.createMany({
              data: applicableImages.map(
                (img: { url: string; isMain?: boolean }) => ({
                  url: img.url,
                  isMain: img.isMain || false,
                  productId: variant.id,
                }),
              ),
            });
          } else {
            // CREATE NEW PRODUCT
            const newProduct = await tx.product.create({
              data: {
                ...productData,
                stock: 0, // Always start at 0
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

            // If payload has initial stock, create an INITIAL_INTAKE movement
            if (finalStock > 0) {
              initialMovements.push({
                storeId: params.storeId,
                productId: newProduct.id, // Use the real ID
                type: "INITIAL_INTAKE",
                quantity: finalStock,
                cost: finalAcqPrice,
                price: finalPrice,
                createdBy: userId, // or "SYSTEM_IMPORT"
                reason: "Initial stock from Product Group creation",
              });
            }
          }
        }),
      );

      await synchronizeProductGroupSlugs(tx, params.storeId, group.id);

      // Execute Initial Movements
      if (initialMovements.length > 0) {
        const { createInventoryMovementBatch } =
          await import("@/lib/inventory");
        await createInventoryMovementBatch(tx, initialMovements);
      }

      return group;
    });

    await invalidateStoreProductsCache(params.storeId);

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
