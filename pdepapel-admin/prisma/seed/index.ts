import { PrismaClient } from "@prisma/client";
import { clearDB } from "./clear-db";
import { seedCategories } from "./seed-categories";
import { seedColors } from "./seed-colors";
import { seedDesigns } from "./seed-designs";
import { seedHomeContent } from "./seed-home-content";
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

/**
 * La tienda que se siembra. Se puede apuntar a otra con `SEED_STORE_ID`, que es
 * lo que hace falta en una base local recién creada, donde el id de siempre no
 * existe.
 */
const DEFAULT_STORE_ID = "4989cec3-307b-4dbb-af4b-114e21f7e00e";

async function main() {
  await prismadb.$connect();
  const storeId = process.env.SEED_STORE_ID || DEFAULT_STORE_ID;
  const store = await prismadb.store.findFirst({
    select: { id: true },
    where: { id: storeId },
  });
  /*
    Antes esto era `store?.id as string`: en una base vacía seguía adelante con
    `undefined` y reventaba cinco pasos después con un error que no decía nada
    del problema real. Ahora lo dice aquí y con la salida.
  */
  if (!store) {
    throw new Error(
      `No existe la tienda ${storeId} en esta base. Crea una tienda con ese id ` +
        `—o pasa SEED_STORE_ID=<id de una que exista>— antes de sembrar.`,
    );
  }
  const STORE_ID = store.id;
  await clearDB(STORE_ID, prismadb);
  await seedHomeContent(STORE_ID, prismadb);
  await seedPosts(STORE_ID, prismadb);
  await seedTypes(STORE_ID, prismadb);
  await seedCategories(STORE_ID, prismadb);
  await seedSizes(STORE_ID, prismadb);
  await seedColors(STORE_ID, prismadb);
  await seedDesigns(STORE_ID, prismadb);
  await seedSuppliers(STORE_ID, prismadb);
  await seedProducts(STORE_ID, prismadb);
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
