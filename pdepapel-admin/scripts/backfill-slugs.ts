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
    `🚀 Starting 100% Raw SQL slug backfill for Database (${process.env.DATABASE_URL ? "Production" : "Local"})...`,
  );

  // 1. Backfill Types
  const types: any[] = await db.$queryRaw`SELECT id, name FROM Type WHERE slug IS NULL OR slug = ''`;
  for (const t of types) {
    const s = slugify(t.name) || t.id.slice(0, 8);
    await db.$executeRaw`UPDATE Type SET slug = ${s} WHERE id = ${t.id}`;
  }

  // 2. Backfill Categories
  const categories: any[] = await db.$queryRaw`SELECT id, name FROM Category WHERE slug IS NULL OR slug = ''`;
  for (const c of categories) {
    const s = slugify(c.name) || c.id.slice(0, 8);
    await db.$executeRaw`UPDATE Category SET slug = ${s} WHERE id = ${c.id}`;
  }

  // 3. Backfill ProductGroups
  const groups: any[] = await db.$queryRaw`SELECT id, name FROM ProductGroup WHERE slug IS NULL OR slug = ''`;
  for (const g of groups) {
    const s = slugify(g.name) || g.id.slice(0, 8);
    await db.$executeRaw`UPDATE ProductGroup SET slug = ${s} WHERE id = ${g.id}`;
  }

  // 4. Load ALL existing non-empty slugs to prevent collisions
  const existingSlugs = new Set<string>();
  const populated: any[] = await db.$queryRaw`SELECT slug FROM Product WHERE slug IS NOT NULL AND slug != ''`;
  populated.forEach((p) => existingSlugs.add(p.slug));

  let [emptyCountRes]: any = await db.$queryRaw`SELECT COUNT(*) as count FROM Product WHERE slug IS NULL OR slug = ''`;
  let remaining = Number(emptyCountRes.count);

  while (remaining > 0) {
    console.log(`Remaining products without slug: ${remaining}... Processing next batch...`);
    const unpopulated: any[] = await db.$queryRaw`
      SELECT 
        p.id, 
        p.name, 
        c.name as colorName, 
        d.name as designName, 
        s.name as sizeName 
      FROM Product p
      LEFT JOIN Color c ON p.colorId = c.id
      LEFT JOIN Design d ON p.designId = d.id
      LEFT JOIN Size s ON p.sizeId = s.id
      WHERE p.slug IS NULL OR p.slug = ''
      LIMIT 100
    `;

    if (unpopulated.length === 0) break;

    for (const p of unpopulated) {
      const colorObj = p.colorName ? { name: p.colorName } : undefined;
      const designObj = p.designName ? { name: p.designName } : undefined;
      const sizeObj = p.sizeName ? { name: p.sizeName } : undefined;

      let baseSlug = "";
      try {
        baseSlug = generateProductSlug({
          name: p.name,
          color: colorObj,
          design: designObj,
          size: sizeObj,
        });
      } catch (e) {
        baseSlug = "";
      }

      if (!baseSlug) baseSlug = slugify(p.name) || `prod-${p.id.slice(0, 8)}`;

      let uniqueSlug = baseSlug;
      let counter = 1;

      while (existingSlugs.has(uniqueSlug)) {
        counter++;
        uniqueSlug = `${baseSlug}-${counter}`;
      }

      existingSlugs.add(uniqueSlug);

      await db.$executeRaw`UPDATE Product SET slug = ${uniqueSlug} WHERE id = ${p.id}`;
    }

    [emptyCountRes] = await db.$queryRaw`SELECT COUNT(*) as count FROM Product WHERE slug IS NULL OR slug = ''`;
    remaining = Number(emptyCountRes.count);
  }

  console.log(
    `🎉 100% COMPLETE! Remaining products without slug: ${remaining}`,
  );
}

main()
  .catch((e) => {
    console.error("❌ Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
