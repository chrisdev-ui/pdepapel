import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "mysql://root@localhost:3306/pdepapel_dev",
    },
  },
});

async function verify() {
  console.log(`🔍 Inspecting unpopulated products...`);

  const unpopulated: any[] = await db.$queryRaw`SELECT id, name, slug, isArchived FROM Product WHERE slug IS NULL OR slug = '' LIMIT 10`;

  console.log("Unpopulated samples:", unpopulated);

  const [totalRes]: any = await db.$queryRaw`SELECT COUNT(*) as count FROM Product`;
  const [emptyRes]: any = await db.$queryRaw`SELECT COUNT(*) as count FROM Product WHERE slug IS NULL OR slug = '' OR CHAR_LENGTH(slug) = 0`;

  console.log(`Total: ${totalRes.count}, Empty: ${emptyRes.count}`);
}

verify()
  .catch((e) => console.error("❌ Verification failed:", e))
  .finally(async () => await db.$disconnect());
