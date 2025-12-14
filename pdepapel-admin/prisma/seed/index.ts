import { PrismaClient } from "@prisma/client";
import { clearDB } from "./clear-db";
import { seedBanners } from "./seed-banners";
import { seedBillboards } from "./seed-billboards";
import { seedCategories } from "./seed-categories";
import { seedColors } from "./seed-colors";
import { seedDesigns } from "./seed-designs";
import { seedMainBanner } from "./seed-main-banner";
import { seedOrders } from "./seed-orders";
import { seedPosts } from "./seed-posts";
import { seedProducts } from "./seed-products";
import { seedReviews } from "./seed-reviews";
import { seedSizes } from "./seed-sizes";
import { seedSuppliers } from "./seed-suppliers";
import { seedTypes } from "./seed-types";
import { seedCoupons } from "./seed-coupons";
import { seedBoxes } from "./seed-boxes";

const prismadb = new PrismaClient();

async function main() {
  await prismadb.$connect();
  const store = await prismadb.store.findFirst({
    select: {
      id: true,
    },
    where: {
      id: "4989cec3-307b-4dbb-af4b-114e21f7e00e",
    },
  });
  const STORE_ID = store?.id as string;
  await clearDB(STORE_ID, prismadb);
  await seedBillboards(STORE_ID, prismadb);
  await seedPosts(STORE_ID, prismadb);
  await seedTypes(STORE_ID, prismadb);
  await seedCategories(STORE_ID, prismadb);
  await seedSizes(STORE_ID, prismadb);
  await seedColors(STORE_ID, prismadb);
  await seedDesigns(STORE_ID, prismadb);
  await seedSuppliers(STORE_ID, prismadb);
  await seedProducts(STORE_ID, prismadb);
  await seedMainBanner(STORE_ID, prismadb);
  await seedBanners(STORE_ID, prismadb);
  await seedReviews(STORE_ID, prismadb);
  await seedCoupons(STORE_ID, prismadb);
  await seedBoxes(prismadb, STORE_ID);
  await seedOrders(STORE_ID, prismadb);
  console.log("🎉 Seed data inserted successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed process failed: ", e);
    process.exit(1);
  })
  .finally(async () => {
    await prismadb.$disconnect();
  });
