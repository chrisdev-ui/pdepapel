import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orderId = process.argv[2];

  if (!orderId) {
    console.log("Please provide an order ID");
    return;
  }

  console.log(`Healing order: ${orderId}...`);

  // 1. Get all items for the order that have NO productId
  const orphanedItems = await prisma.orderItem.findMany({
    where: {
      orderId: orderId,
      productId: null,
    },
  });

  console.log(`Found ${orphanedItems.length} orphaned items.`);

  let healedCount = 0;

  for (const item of orphanedItems) {
    // Skip items that are truly manual (e.g. valid SKU "MAN-..." or "MANUAL")
    // BUT checking if a product exists with this SKU is safer.
    if (!item.sku) continue;

    console.log(`Checking SKU: ${item.sku} for Item: ${item.name}`);

    // 2. Try to find a real product with this SKU in the same store (we need storeId from order)
    // We can infer storeId from the product lookup generally or fetching order first.
    // SKUs are typically unique per store or globally. Let's try global match first which is likely safe for this DB.
    const product = await prisma.product.findFirst({
      where: {
        sku: item.sku,
        isArchived: false,
      },
    });

    if (product) {
      console.log(`-> MATCH FOUND! Re-linking to Product ID: ${product.id}`);

      // 3. Update the item
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          productId: product.id,
          // Update items created as "manual" might need cost/price sync?
          // Usually we just want to restore the link.
        },
      });
      healedCount++;
    } else {
      console.log(`-> No matching product found (might be truly manual).`);
    }
  }

  console.log(`\nOperation Complete. Healed ${healedCount} items.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
