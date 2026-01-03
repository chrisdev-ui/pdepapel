import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { Prisma } from "@prisma/client";
import { auth } from "@clerk/nextjs";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import { verifyStoreOwner } from "@/lib/db-utils";

// POST /api/[storeId]/migration/inventory
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    const { storeId } = params;

    // Verify ownership
    await verifyStoreOwner(userId, storeId);

    // 2. Get all products with stock != 0
    const products = await prismadb.product.findMany({
      where: {
        storeId,
        NOT: { stock: 0 },
      },
      select: {
        id: true,
        stock: true,
        name: true,
        acqPrice: true,
      },
    });

    console.log(
      `[MIGRACIÓN] Encontrados ${products.length} productos para migrar.`,
    );

    let migratedCount = 0;
    let errors: { productId: string; error: string }[] = [];

    // 3. Process each product transactionally
    for (const product of products) {
      try {
        // Check if already migrated?
        const existingMigration = await prismadb.inventoryMovement.findFirst({
          where: {
            productId: product.id,
            type: "INITIAL_MIGRATION",
          },
        });

        if (existingMigration) {
          console.log(`[SKIP] Producto ${product.name} ya migrado.`);
          continue;
        }

        // Run transaction
        await prismadb.$transaction(async (tx: Prisma.TransactionClient) => {
          // Manually insert logic to avoid double-counting stock
          await tx.inventoryMovement.create({
            data: {
              storeId,
              productId: product.id,
              type: "INITIAL_MIGRATION",
              quantity: product.stock,
              previousStock: 0,
              newStock: product.stock,
              cost: product.acqPrice,
              reason: "Migración inicial de stock",
              createdBy: userId, // Track the admin who ran it
            },
          });
        });

        migratedCount++;
      } catch (error: any) {
        console.error(`[ERROR] Fallo al migrar ${product.name}:`, error);
        errors.push({ productId: product.id, error: error.message });
      }
    }

    return NextResponse.json({
      message: "Migración completada",
      processed: products.length,
      migrated: migratedCount,
      errors,
    });
  } catch (error) {
    return handleErrorResponse(error, "INVENTORY_MIGRATION_POST");
  }
}
