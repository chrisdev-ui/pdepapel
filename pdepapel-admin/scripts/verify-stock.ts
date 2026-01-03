import prismadb from "../lib/prismadb";

async function verifyStockIntegrity() {
  console.log("🔍 Verifying Stock Integrity...");

  try {
    const products = await prismadb.product.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, stock: true },
      take: 50,
    });

    console.log(`Checking ${products.length} products...`);

    let errors = 0;

    for (const product of products) {
      // Calculate stock from Inventory Movements
      const movements = await prismadb.inventoryMovement.aggregate({
        where: { productId: product.id },
        _sum: { quantity: true },
      });

      const calculatedStock = movements._sum.quantity || 0;

      if (calculatedStock !== product.stock) {
        // Double check if there are NO movements (might be pre-migration product?)
        // If pre-migration product has stock > 0 but NO movements, that's a problem (Step 2 migration should have fixed this)
        console.error(
          `❌ MISMATCH: ${product.name} (ID: ${product.id}) - Product.stock: ${product.stock}, Calculated: ${calculatedStock}`,
        );
        errors++;
      }
    }

    if (errors === 0) {
      console.log("✅ All checked products are consistent!");
    } else {
      console.error(`⚠️ Found ${errors} inconsistencies.`);
    }
  } catch (error) {
    console.error("Error verifying stock:", error);
  } finally {
    await prismadb.$disconnect();
  }
}

verifyStockIntegrity();
