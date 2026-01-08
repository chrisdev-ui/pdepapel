import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { generateSemanticSKU } from "@/lib/variant-generator";
import { auth } from "@clerk/nextjs";
import { InventoryMovementType, RestockOrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";

interface ProductInput {
  name: string;
  description: string;
  price: number;
  acqPrice: number;
  sku: string;
  categoryName: string;
  sizeName: string;
  colorName: string;
  designName: string;
  stock: number;
  images: string[];
}

interface BatchPayload {
  products: ProductInput[];
  supplierId?: string;
  shippingCost?: number;
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

    const body: BatchPayload = await req.json();
    const { products, supplierId, shippingCost } = body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      throw ErrorFactory.InvalidRequest("No hay productos para importar");
    }

    // Verify supplier exists if provided
    if (supplierId) {
      const supplier = await prismadb.supplier.findFirst({
        where: { id: supplierId, storeId: params.storeId },
      });
      if (!supplier) {
        throw ErrorFactory.NotFound("Proveedor no encontrado");
      }
    }

    // Use transaction for data integrity
    const result = await prismadb.$transaction(
      async (tx) => {
        let restockOrderId: string | null = null;
        let restockOrderNumber: string | null = null;

        // Create Restock Order if supplier is provided
        if (supplierId) {
          // Generate order number
          const lastOrder = await tx.restockOrder.findFirst({
            where: { storeId: params.storeId },
            orderBy: { createdAt: "desc" },
            select: { orderNumber: true },
          });

          let nextNumber = 1001;
          if (lastOrder?.orderNumber) {
            const match = lastOrder.orderNumber.match(/PO-(\d+)/);
            if (match) {
              nextNumber = parseInt(match[1], 10) + 1;
            }
          }
          restockOrderNumber = `PO-${nextNumber}`;

          const restockOrder = await tx.restockOrder.create({
            data: {
              storeId: params.storeId,
              supplierId,
              orderNumber: restockOrderNumber,
              status: RestockOrderStatus.COMPLETED,
              shippingCost: shippingCost || 0,
              totalAmount: 0, // Will be updated after items are added
              notes: `Importación masiva de ${products.length} productos`,
            },
          });
          restockOrderId = restockOrder.id;
        }

        const createdProductIds: string[] = [];
        let totalRestockAmount = 0;
        let itemIndex = 0;

        for (const product of products) {
          // Resolve or Create Category
          // Category requires a Type, we'll use the first Type or create a default
          let type = await tx.type.findFirst({
            where: { storeId: params.storeId },
          });
          if (!type) {
            type = await tx.type.create({
              data: {
                storeId: params.storeId,
                name: "General",
              },
            });
          }

          let category = await tx.category.findFirst({
            where: {
              storeId: params.storeId,
              name: { equals: product.categoryName },
            },
          });
          if (!category) {
            category = await tx.category.create({
              data: {
                storeId: params.storeId,
                name: product.categoryName,
                typeId: type.id,
              },
            });
          }

          // Resolve or Create Size
          // Size has unique constraint on (storeId, value), so we search by value OR name
          let size = await tx.size.findFirst({
            where: {
              storeId: params.storeId,
              OR: [
                { value: { equals: product.sizeName } },
                { name: { equals: product.sizeName } },
              ],
            },
          });
          if (!size) {
            size = await tx.size.create({
              data: {
                storeId: params.storeId,
                name: product.sizeName,
                value: product.sizeName,
              },
            });
          }

          // Resolve or Create Color
          let color = await tx.color.findFirst({
            where: {
              storeId: params.storeId,
              name: { equals: product.colorName },
            },
          });
          if (!color) {
            color = await tx.color.create({
              data: {
                storeId: params.storeId,
                name: product.colorName,
                value: "#CCCCCC", // Default gray
              },
            });
          }

          // Resolve or Create Design
          let design = await tx.design.findFirst({
            where: {
              storeId: params.storeId,
              name: { equals: product.designName },
            },
          });
          if (!design) {
            design = await tx.design.create({
              data: {
                storeId: params.storeId,
                name: product.designName,
              },
            });
          }

          // Generate SKU if not provided
          let sku = product.sku;
          if (!sku) {
            sku = generateSemanticSKU(
              category.name,
              design.name,
              color.name,
              size.value || size.name,
            );
          }

          // Ensure SKU is unique
          const existingSku = await tx.product.findUnique({
            where: { sku },
          });
          if (existingSku) {
            // Append random suffix
            sku = `${sku}-${Date.now().toString(36)}`;
          }

          // Create Product
          const createdProduct = await tx.product.create({
            data: {
              storeId: params.storeId,
              name: product.name,
              description: product.description || "",
              price: product.price,
              acqPrice: product.acqPrice || 0,
              stock: product.stock || 0,
              sku,
              categoryId: category.id,
              sizeId: size.id,
              colorId: color.id,
              designId: design.id,
              supplierId: supplierId || null,
              isArchived: false,
              isFeatured: false,
              images:
                product.images && product.images.length > 0
                  ? {
                      createMany: {
                        data: product.images.map((url, idx) => ({
                          url,
                          isMain: idx === 0,
                        })),
                      },
                    }
                  : undefined,
            },
          });

          createdProductIds.push(createdProduct.id);

          // Create Restock Order Item if applicable
          if (restockOrderId && product.stock > 0) {
            const subtotal = product.stock * (product.acqPrice || 0);
            totalRestockAmount += subtotal;

            await tx.restockOrderItem.create({
              data: {
                restockOrderId,
                productId: createdProduct.id,
                index: itemIndex++,
                quantity: product.stock,
                quantityReceived: product.stock, // Already received
                cost: product.acqPrice || 0,
                subtotal,
              },
            });

            // Create Inventory Movement
            await tx.inventoryMovement.create({
              data: {
                storeId: params.storeId,
                productId: createdProduct.id,
                type: InventoryMovementType.RESTOCK_RECEIVED,
                quantity: product.stock,
                previousStock: 0,
                newStock: product.stock,
                cost: product.acqPrice || 0,
                price: product.price,
                reason: `Importación masiva - Orden ${restockOrderNumber}`,
                description: `Producto creado via importación CSV`,
                referenceId: restockOrderId,
                createdBy: userId,
              },
            });
          } else if (product.stock > 0) {
            // No restock order, but still record inventory movement
            await tx.inventoryMovement.create({
              data: {
                storeId: params.storeId,
                productId: createdProduct.id,
                type: InventoryMovementType.INITIAL_MIGRATION,
                quantity: product.stock,
                previousStock: 0,
                newStock: product.stock,
                cost: product.acqPrice || 0,
                price: product.price,
                reason: "Importación masiva de productos",
                description: `Producto creado via importación CSV`,
                createdBy: userId,
              },
            });
          }
        }

        // Update Restock Order total
        if (restockOrderId) {
          await tx.restockOrder.update({
            where: { id: restockOrderId },
            data: { totalAmount: totalRestockAmount },
          });
        }

        return {
          successCount: createdProductIds.length,
          restockOrderId,
          restockOrderNumber,
        };
      },
      {
        maxWait: 30000, // 30 seconds max wait
        timeout: 60000, // 60 seconds timeout
      },
    );

    // Invalidate product cache
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
    return handleErrorResponse(error, "PRODUCTS_BATCH_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
