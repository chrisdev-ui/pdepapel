import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl || databaseUrl !== testDatabaseUrl) {
  throw new Error(
    "Las pruebas de integración requieren TEST_DATABASE_URL y deben ejecutarse con npm run test:integration.",
  );
}

const parsedUrl = new URL(testDatabaseUrl);
if (
  !["127.0.0.1", "::1", "localhost"].includes(parsedUrl.hostname) ||
  parsedUrl.pathname !== "/pdepapel_test"
) {
  throw new Error(
    "Las pruebas de integración solo se pueden conectar a la base local pdepapel_test.",
  );
}

export const testPrisma = new PrismaClient();

export type InventoryFixture = Awaited<
  ReturnType<typeof createInventoryFixture>
>;

export async function createInventoryFixture() {
  const suffix = randomUUID();
  const store = await testPrisma.store.create({
    data: {
      name: `Tienda de pruebas ${suffix}`,
      userId: `test-user-${suffix}`,
    },
  });
  const type = await testPrisma.type.create({
    data: { name: "Papelería", slug: `papeleria-${suffix}`, storeId: store.id },
  });
  const category = await testPrisma.category.create({
    data: {
      name: "Agendas",
      slug: `agendas-${suffix}`,
      storeId: store.id,
      typeId: type.id,
    },
  });
  const size = await testPrisma.size.create({
    data: { name: "Pequeño", value: `s-${suffix}`, storeId: store.id },
  });
  const color = await testPrisma.color.create({
    data: { name: "Rosa", value: `rosa-${suffix}`, storeId: store.id },
  });
  const design = await testPrisma.design.create({
    data: { name: "Kawaii", storeId: store.id },
  });

  const createProduct = (name: string, stock: number, isKit = false) =>
    testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${suffix}`,
        description: "Producto de pruebas",
        stock,
        price: 10000,
        acqPrice: 4000,
        sku: `TEST-${suffix}-${name}`,
        isKit,
        storeId: store.id,
        categoryId: category.id,
        colorId: color.id,
        sizeId: size.id,
        designId: design.id,
      },
    });

  const component = await createProduct("Componente", 6);
  const kit = await createProduct("Kit", 0, true);
  await testPrisma.productKit.create({
    data: { kitId: kit.id, componentId: component.id, quantity: 2 },
  });

  return { category, component, kit, store };
}

export async function deleteInventoryFixture(fixture: InventoryFixture) {
  const productIds = [fixture.component.id, fixture.kit.id];
  const fairEvents = await testPrisma.fairEvent.findMany({
    where: { storeId: fixture.store.id },
    select: { id: true },
  });
  const fairEventIds = fairEvents.map((fairEvent) => fairEvent.id);
  const storeOrders = await testPrisma.order.findMany({
    where: { storeId: fixture.store.id },
    select: { id: true },
  });
  const storeOrderIds = storeOrders.map((order) => order.id);

  if (fairEventIds.length > 0) {
    await testPrisma.fairCapsule.deleteMany({
      where: { fairEventId: { in: fairEventIds } },
    });
    await testPrisma.fairEventInventoryItem.deleteMany({
      where: { fairEventId: { in: fairEventIds } },
    });
  }
  if (storeOrderIds.length > 0) {
    await testPrisma.orderItem.deleteMany({
      where: { orderId: { in: storeOrderIds } },
    });
    await testPrisma.paymentDetails.deleteMany({
      where: { orderId: { in: storeOrderIds } },
    });
    await testPrisma.order.deleteMany({
      where: { id: { in: storeOrderIds } },
    });
  }

  const marketplaceConnections = await testPrisma.marketplaceConnection.findMany({
    where: { storeId: fixture.store.id },
    select: { id: true },
  });
  const marketplaceConnectionIds = marketplaceConnections.map(
    (connection) => connection.id,
  );
  if (marketplaceConnectionIds.length > 0) {
    await testPrisma.marketplaceOutboxEvent.deleteMany({
      where: { connectionId: { in: marketplaceConnectionIds } },
    });
    await testPrisma.marketplaceListing.deleteMany({
      where: { connectionId: { in: marketplaceConnectionIds } },
    });
    await testPrisma.marketplaceConnection.deleteMany({
      where: { id: { in: marketplaceConnectionIds } },
    });
  }
  if (fairEventIds.length > 0) {
    await testPrisma.fairEvent.deleteMany({
      where: { id: { in: fairEventIds } },
    });
  }

  await testPrisma.inventoryMovement.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.productKit.deleteMany({
    where: {
      OR: [{ kitId: { in: productIds } }, { componentId: { in: productIds } }],
    },
  });
  await testPrisma.product.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.category.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.type.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.size.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.color.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.design.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.store.delete({ where: { id: fixture.store.id } });
}
