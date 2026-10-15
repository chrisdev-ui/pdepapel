import { PrismaClient } from "@prisma/client";

import { assertTestDatabaseEnv } from "../../scripts/lib/test-database.mjs";

const BOX_CONFIGURATIONS = {
  XS: {
    width: 26,
    length: 16,
    height: 8,
    type: "box",
    size: "XS",
  },
  S: {
    width: 20,
    length: 21,
    height: 10,
    type: "box",
    size: "S",
  },
  M: {
    width: 33,
    length: 20,
    height: 10,
    type: "box",
    size: "M",
  },
  L: {
    width: 33,
    length: 26,
    height: 10,
    type: "box",
    size: "L",
  },
  XL: {
    width: 40,
    length: 30,
    height: 20,
    type: "box",
    size: "XL",
  },
};

export const seedBoxes = async (prisma: PrismaClient, storeId: string) => {
  console.log("📦 Seeding boxes...");

  for (const [key, config] of Object.entries(BOX_CONFIGURATIONS)) {
    const type = key as "XS" | "S" | "M" | "L" | "XL";

    const existingBox = await prisma.box.findFirst({
      where: {
        storeId,
        type: type,
      },
    });

    if (existingBox) {
      console.log(`ℹ️ Box ${type} already exists. Skipping...`);
      continue;
    }

    await prisma.box.create({
      data: {
        storeId,
        name: `Caja ${type}`,
        type: type,
        width: config.width,
        height: config.height,
        length: config.length,
        isDefault: true,
      },
    });

    console.log(`✅ Created default box: ${type}`);
  }
};

// Allow running this seed script standalone
if (require.main === module) {
  const prisma = new PrismaClient({ datasourceUrl: assertTestDatabaseEnv(process.env, "prisma/seed/seed-boxes") });

  const main = async () => {
    // 1. Try to get STORE_ID from env variable
    let storeId = process.env.STORE_ID;

    // 2. If not in env, try to get from command line args
    if (!storeId) {
      const args = process.argv.slice(2);
      if (args.length > 0) {
        storeId = args[0];
      }
    }

    // 3. If still not found, try to fetch the first store from DB
    if (!storeId) {
      console.log("⚠️ No STORE_ID provided. Attempting to find first store...");
      const store = await prisma.store.findFirst();
      if (store) {
        storeId = store.id;
        console.log(`ℹ️ Found store: ${store.name} (${store.id})`);
      }
    }

    if (!storeId) {
      throw new Error("❌ Could not determine STORE_ID.");
    }

    await seedBoxes(prisma, storeId);
  };

  main()
    .then(() => {
      console.log("🎉 Boxes seeded successfully!");
    })
    .catch((e) => {
      console.error("❌ Box seeding failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
