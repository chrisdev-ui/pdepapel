import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { MAX_WAIT_TIME, TIMEOUT_TIME } from "@/constants";

import { assertTestDatabaseEnv } from "../../../scripts/lib/test-database.mjs";
import { drainBackground } from "./background";

const testDatabaseUrl = assertTestDatabaseEnv(process.env, "integración");

/**
 * Mismo aislamiento que producción (`lib/prismadb.ts`): con el nivel por
 * defecto, dos movimientos simultáneos del mismo producto se confirman los dos
 * y el kardex guarda filas que se pisan.
 */
export const testPrisma = new PrismaClient({
  datasourceUrl: testDatabaseUrl,
  transactionOptions: {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: MAX_WAIT_TIME,
    timeout: TIMEOUT_TIME,
  },
});

export type InventoryFixture = Awaited<
  ReturnType<typeof createInventoryFixture>
>;

export async function createInventoryFixture() {
  const suffix = randomUUID();
  const store = await testPrisma.store.create({
    data: {
      name: `Tienda de pruebas ${suffix}`,
      userId: `test-user-${suffix}`,
      // Como la tienda real: los avisos del panel van a este correo mientras
      // Configuración no tenga una lista propia.
      email: "avisos@prueba.test",
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
  // Un aviso o correo que la prueba dejó corriendo puede escribir filas de la tienda después de borrar los pedidos.
  await drainBackground();
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
  await testPrisma.capsuleDailySlot.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.capsuleDayCap.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.capsuleSlip.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.capsuleOrder.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.capsuleBatchItem.deleteMany({ where: { batch: { storeId: fixture.store.id } } });
  await testPrisma.capsuleBatch.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.capsulePackOption.deleteMany({ where: { edition: { storeId: fixture.store.id } } });
  await testPrisma.capsuleEdition.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.stockReservationEvent.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.stockReservationItem.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.stockReservation.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.orderInventoryIssue.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.orderNotification.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.shippingWebhookEvent.deleteMany({ where: { storeId: fixture.store.id } });
  if (storeOrderIds.length > 0) {
    await testPrisma.orderItem.deleteMany({
      where: { orderId: { in: storeOrderIds } },
    });
    await testPrisma.paymentDetails.deleteMany({
      where: { orderId: { in: storeOrderIds } },
    });
    await testPrisma.shipping.deleteMany({
      where: { orderId: { in: storeOrderIds } },
    });
    await testPrisma.order.deleteMany({
      where: { id: { in: storeOrderIds } },
    });
  }

  const marketplaceConnections =
    await testPrisma.marketplaceConnection.findMany({
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
  const growthCampaigns = await testPrisma.growthCampaign.findMany({
    where: { storeId: fixture.store.id },
    select: { id: true },
  });
  const growthCampaignIds = growthCampaigns.map((campaign) => campaign.id);
  if (growthCampaignIds.length > 0) {
    await testPrisma.growthCampaignProduct.deleteMany({
      where: { campaignId: { in: growthCampaignIds } },
    });
    await testPrisma.growthCampaign.deleteMany({
      where: { id: { in: growthCampaignIds } },
    });
  }
  await testPrisma.businessCashMovement.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.businessCashPolicy.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.customerReactivation.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.newsletterSubscriber.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.couponRedemption.deleteMany({
    where: { coupon: { storeId: fixture.store.id } },
  });
  await testPrisma.coupon.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.homeContentProduct.deleteMany({
    where: { homeContent: { storeId: fixture.store.id } },
  });
  await testPrisma.homeContent.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.catalogMigrationSuggestion.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.productCatalogOptionValue.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.categoryCatalogOption.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.catalogOptionValue.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.catalogOption.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.productKit.deleteMany({
    where: {
      OR: [{ kitId: { in: productIds } }, { componentId: { in: productIds } }],
    },
  });
  await testPrisma.productPriceTier.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.product.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.deletedProductUrl.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.category.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.typeSlugAlias.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.type.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.shippingProfile.deleteMany({
    where: { storeId: fixture.store.id },
  });
  await testPrisma.size.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.color.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.design.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.orderInventoryIssue.deleteMany({
    where: { storeId: fixture.store.id },
  });
  // Un aviso de envío tardío puede dejar su fila aunque el pedido ya no exista.
  await testPrisma.orderNotification.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.store.delete({ where: { id: fixture.store.id } });
}
