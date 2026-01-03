import prismadb from "../../lib/prismadb";

const prisma = prismadb;
const TARGET_GROUP_ID = "ea308d7b-d418-4048-93a0-2edb545537bc";

async function main() {
  console.log(`Starting strict deletion for Group ID: ${TARGET_GROUP_ID}`);

  try {
    // 1. Verify group exists
    const group = await prismadb.productGroup.findUnique({
      where: { id: TARGET_GROUP_ID },
      include: { products: true },
    });

    if (!group) {
      console.log("❌ Product Group not found.");
      return;
    }

    console.log(`✅ Found Group: "${group.name}"`);
    console.log(
      `📊 Found ${group.products.length} associated variants (Products).`,
    );

    // 2. Delete Variants
    if (group.products.length > 0) {
      const deletedVariants = await prismadb.product.deleteMany({
        where: { productGroupId: TARGET_GROUP_ID },
      });
      console.log(`🗑️  Deleted ${deletedVariants.count} variants.`);
    }

    // 3. Delete Group
    const deletedGroup = await prismadb.productGroup.delete({
      where: { id: TARGET_GROUP_ID },
    });
    console.log(`🗑️  Deleted Group: "${deletedGroup.name}"`);

    console.log("✨ Cleanup complete.");
  } catch (error) {
    console.error("❌ Error during deletion:", error);
  } finally {
    await prismadb.$disconnect();
  }
}

main();
