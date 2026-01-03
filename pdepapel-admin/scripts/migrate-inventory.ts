import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STORE_ID = process.env.STORE_ID;
const USER_ID = process.env.USER_ID; // The admin user running the migration

async function main() {
  let storeId = STORE_ID;
  let userId = USER_ID;

  if (!storeId || !userId) {
    console.log(
      "No STORE_ID or USER_ID provided. Attempting to fetch from database...",
    );
    const store = await prisma.store.findFirst();

    if (!store) {
      console.error(
        "No store found in database. Please provide STORE_ID and USER_ID manually.",
      );
      process.exit(1);
    }

    if (!storeId) {
      storeId = store.id;
      console.log(`Auto-detected Store ID: ${storeId}`);
    }

    if (!userId) {
      userId = store.userId;
      console.log(`Auto-detected User ID: ${userId}`);
    }
  }

  if (!storeId || !userId) {
    throw new Error("Could not determine Store ID or User ID.");
  }

  // Bind to const to ensure type narrowing persists in callbacks
  const finalStoreId = storeId;
  const finalUserId = userId;

  console.log(`Starting migration for Store: ${finalStoreId}`);

  // 1. Get all products with stock != 0
  const products = await prisma.product.findMany({
    where: {
      storeId: finalStoreId,
      NOT: { stock: 0 },
    },
    select: {
      id: true,
      stock: true,
      name: true,
      acqPrice: true,
    },
  });

  console.log(`Found ${products.length} products to migrate.`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errors: any[] = [];

  const spinnerChars = ["|", "/", "-", "\\"];
  let spinnerIndex = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    // Update spinner
    const spinner = spinnerChars[spinnerIndex++ % spinnerChars.length];
    const progress = `[${i + 1}/${products.length}]`;
    process.stdout.write(
      `\r${spinner} ${progress} Processing: ${product.name.substring(0, 30)}${product.name.length > 30 ? "..." : ""}          `,
    );

    try {
      // Check if already migrated
      const existingMigration = await prisma.inventoryMovement.findFirst({
        where: {
          productId: product.id,
          type: "INITIAL_MIGRATION",
        },
      });

      if (existingMigration) {
        skippedCount++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.inventoryMovement.create({
          data: {
            storeId: finalStoreId,
            productId: product.id,
            type: "INITIAL_MIGRATION",
            quantity: product.stock,
            previousStock: 0,
            newStock: product.stock,
            cost: product.acqPrice || 0,
            reason: "Migración inicial de stock (Script)",
            createdBy: finalUserId,
          },
        });
      });

      migratedCount++;
      // No dot printing anymore
    } catch (error: any) {
      process.stdout.write(
        `\n❌ Failed to migrate ${product.name}: ${error.message}\n`,
      );
      errors.push({ id: product.id, name: product.name, error: error.message });
    }
  }

  console.log("\n\nMigration Complete.");
  console.log(`Processed: ${products.length}`);
  console.log(`Migrated: ${migratedCount}`);
  console.log(`Skipped (Already Done): ${skippedCount}`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log("Errors details:", JSON.stringify(errors, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
