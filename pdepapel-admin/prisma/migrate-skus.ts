import prismadb from "../lib/prismadb";

const prisma = prismadb;

function cleanSlug(text: string): string {
  if (!text) return "UNK";
  return text
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 3);
}

function cleanSlugFull(text: string): string {
  if (!text) return "UNK";
  return text
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "");
}

async function main() {
  console.log("Starting SKU migration...");

  const products = await prisma.product.findMany({
    include: {
      category: true,
      design: true,
      color: true,
      size: true,
    },
  });

  console.log(`Found ${products.length} products.`);

  let updatedCount = 0;

  for (const product of products) {
    // If fields are missing, try to do best effort or skip?
    // Data integrity says relations should be there, but strictly check.
    const cat = product.category ? cleanSlug(product.category.name) : "UNK";
    const des = product.design ? cleanSlug(product.design.name) : "UNK";
    const col = product.color ? cleanSlug(product.color.name) : "UNK";
    const siz = product.size ? cleanSlugFull(product.size.value) : "UNK";

    // Generate Random Seq
    const seq = Math.floor(1000 + Math.random() * 9000);

    const newSku = `${cat}-${des}-${col}-${siz}-${seq}`;

    console.log(
      `[${updatedCount + 1}/${products.length}] Updating ${product.name} (${product.id}) -> ${newSku}`,
    );

    try {
      await prisma.product.update({
        where: { id: product.id },
        data: { sku: newSku },
      });
      updatedCount++;
    } catch (error) {
      console.error(`Failed to update product ${product.id}:`, error);
    }
  }

  console.log(`SKU migration complete. Updated ${updatedCount} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
