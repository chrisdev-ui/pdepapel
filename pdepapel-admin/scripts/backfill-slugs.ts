import { PrismaClient } from "@prisma/client";
import { generateProductSlug, slugify } from "../lib/slugify";

const db = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "mysql://root@localhost:3306/pdepapel_dev",
    },
  },
});

async function main() {
  console.log(
    `🚀 Starting slug backfill for Database (${process.env.DATABASE_URL ? "Production" : "Local"})...`,
  );

  // 1. Backfill Types
  const types = await db.type.findMany({
    where: { slug: "" },
  });
  console.log(`Found ${types.length} types to backfill...`);
  for (const t of types) {
    const s = slugify(t.name) || t.id.slice(0, 8);
    await db.type.update({ where: { id: t.id }, data: { slug: s } });
  }

  // 2. Backfill Categories
  const categories = await db.category.findMany({
    where: { slug: "" },
  });
  console.log(`Found ${categories.length} categories to backfill...`);
  for (const c of categories) {
    const s = slugify(c.name) || c.id.slice(0, 8);
    await db.category.update({ where: { id: c.id }, data: { slug: s } });
  }

  // 3. Backfill ProductGroups
  const groups = await db.productGroup.findMany({
    where: { slug: "" },
  });
  console.log(`Found ${groups.length} product groups to backfill...`);
  for (const g of groups) {
    const s = slugify(g.name) || g.id.slice(0, 8);
    await db.productGroup.update({
      where: { id: g.id },
      data: { slug: s },
    });
  }

  // 4. Backfill Products
  const products = await db.product.findMany({
    where: { slug: "" },
    include: { color: true, design: true, size: true },
  });
  console.log(`Found ${products.length} products to backfill...`);

  const slugCount: Record<string, number> = {};

  for (const p of products) {
    let baseSlug = generateProductSlug(p);
    if (!baseSlug) baseSlug = slugify(p.name) || `prod-${p.id.slice(0, 8)}`;

    let uniqueSlug = baseSlug;
    if (slugCount[baseSlug]) {
      slugCount[baseSlug] += 1;
      uniqueSlug = `${baseSlug}-${slugCount[baseSlug]}`;
    } else {
      slugCount[baseSlug] = 1;
    }

    await db.product.update({
      where: { id: p.id },
      data: { slug: uniqueSlug },
    });
  }

  console.log("✅ Backfill completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
