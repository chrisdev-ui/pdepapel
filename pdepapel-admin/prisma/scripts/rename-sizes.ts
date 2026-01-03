import prismadb from "../../lib/prismadb";

const prisma = prismadb;

// Map of Old Name -> New Name
// This approach is safe for ANY environment (Dev or Prod) because it ignores IDs
// and targets the "weird names" directly.
const nameMappings = [
  // XS
  { old: "Muy Pequeño liviano", new: "XS" },
  { old: "Muy Pequeño pesado", new: "XS+" },

  // S
  { old: "Pequeño liviano", new: "S" },
  { old: "Pequeño pesado", new: "S+" },

  // M
  { old: "Mediano liviano", new: "M" },
  { old: "Mediano pesado", new: "M+" },

  // L
  { old: "Grande liviano", new: "L" },
  { old: "Grande pesado", new: "L+" },

  // XL
  { old: "Muy Grande liviano", new: "XL" },
  { old: "Muy Grande pesado", new: "XL+" },
];

async function main() {
  console.log("🚀 Starting environment-agnostic size renaming...");

  for (const mapping of nameMappings) {
    try {
      // updateMany finds ALL records with the old name and updates them.
      const result = await prisma.size.updateMany({
        where: { name: mapping.old },
        data: { name: mapping.new },
      });

      if (result.count > 0) {
        console.log(
          `✅ Updated ${result.count} sizes: "${mapping.old}" -> "${mapping.new}"`,
        );
      } else {
        console.log(`ℹ️  No sizes found for: "${mapping.old}" (Skipping)`);
      }
    } catch (error) {
      console.error(`❌ Error updating "${mapping.old}":`, error);
    }
  }

  console.log("🏁 Update script finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
