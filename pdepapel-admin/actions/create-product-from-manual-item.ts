"use server";

import prismadb from "@/lib/prismadb";
import { createInventoryMovementBatch } from "@/lib/inventory";
import { auth } from "@clerk/nextjs";
import { InventoryMovementType } from "@prisma/client";

interface CreateProductParams {
  storeId: string;
  name: string;
  price: number;
  cost: number;
  categoryId: string;
  stock: number;
  imageUrl?: string;
  description?: string;
  isArchived?: boolean;
  orderId?: string;
  orderItemId?: string;
}

export async function createProductFromManualItem(data: CreateProductParams) {
  const { userId } = auth();

  if (!userId) {
    throw new Error("Unauthenticated");
  }

  // Fetch or Create Defaults for Required Relations (Size, Color, Design)
  // This ensures the product is valid in the schema
  const defaultSize =
    (await prismadb.size.findFirst({
      where: { storeId: data.storeId },
    })) ||
    (await prismadb.size.create({
      data: { storeId: data.storeId, name: "Unico", value: "Standard" },
    }));

  const defaultColor =
    (await prismadb.color.findFirst({
      where: { storeId: data.storeId },
    })) ||
    (await prismadb.color.create({
      data: { storeId: data.storeId, name: "Unico", value: "#000000" },
    }));

  const defaultDesign =
    (await prismadb.design.findFirst({
      where: { storeId: data.storeId },
    })) ||
    (await prismadb.design.create({
      data: { storeId: data.storeId, name: "Unico" },
    }));

  // 1. Create Product
  const product = await prismadb.product.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      sku: `MAN-${Date.now()}`,
      price: data.price,
      acqPrice: data.cost, // Map cost to acqPrice
      categoryId: data.categoryId,
      stock: 0, // Initial stock set to 0, movement will update it
      description: data.description || "Converted from Manual Item",
      isArchived: data.isArchived ?? true,
      isFeatured: false,
      sizeId: defaultSize.id,
      colorId: defaultColor.id,
      designId: defaultDesign.id,
      images: data.imageUrl
        ? {
            create: {
              url: data.imageUrl,
              isMain: true,
            },
          }
        : undefined,
    },
    include: {
      images: true,
      category: true,
    },
  });

  // 2. Create Initial Inventory Movement if stock > 0
  if (data.stock > 0) {
    await createInventoryMovementBatch(
      prismadb,
      [
        {
          productId: product.id,
          storeId: data.storeId,
          quantity: data.stock,
          type: InventoryMovementType.MANUAL_ADJUSTMENT,
          reason: "Conversión Item Manual -> Producto",
          createdBy: userId,
        },
      ],
      false, // don't skip stock update, although we already set it in create
    );
  }

  // 3. Atomically Link to Order Item (Persistence Fix)
  if (data.orderId && data.orderItemId) {
    await prismadb.orderItem.update({
      where: {
        id: data.orderItemId,
        orderId: data.orderId, // Security check
      },
      data: {
        productId: product.id,
      },
    });
  }

  return product;
}
