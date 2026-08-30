import { PrismaClient } from "@prisma/client";

const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const productId = "e2e-fair-product";
const archivedProductId = "e2e-archived-product";
const typeId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const legacyTypeId = "e2e-fair-type";
const legacyCategoryId = "e2e-fair-category";
const sizeId = "e2e-fair-size";
const colorId = "e2e-fair-color";
const designId = "e2e-fair-design";

if (!clerkUserId) {
  throw new Error(
    "E2E_ADMIN_CLERK_USER_ID es obligatoria para preparar la tienda de pruebas.",
  );
}

const prisma = new PrismaClient();

async function main() {
  await prisma.store.upsert({
    where: { id: storeId },
    update: {
      name: "P de Papel E2E",
      userId: clerkUserId!,
    },
    create: {
      id: storeId,
      name: "P de Papel E2E",
      userId: clerkUserId!,
    },
  });

  const existingFairs = await prisma.fairEvent.findMany({
    where: { storeId, name: { startsWith: "E2E Feria" } },
    select: { id: true },
  });
  const fairEventIds = existingFairs.map((fairEvent) => fairEvent.id);
  const fairOrders = fairEventIds.length
    ? await prisma.order.findMany({
        where: { fairEventId: { in: fairEventIds } },
        select: { id: true },
      })
    : [];
  const fairOrderIds = fairOrders.map((order) => order.id);

  if (fairEventIds.length > 0) {
    await prisma.fairCapsule.deleteMany({
      where: { fairEventId: { in: fairEventIds } },
    });
    await prisma.fairEventInventoryItem.deleteMany({
      where: { fairEventId: { in: fairEventIds } },
    });
  }
  if (fairOrderIds.length > 0) {
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: fairOrderIds } },
    });
    await prisma.paymentDetails.deleteMany({
      where: { orderId: { in: fairOrderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: fairOrderIds } } });
  }
  if (fairEventIds.length > 0) {
    await prisma.fairEvent.deleteMany({
      where: { id: { in: fairEventIds } },
    });
  }

  await prisma.productCatalogOptionValue.deleteMany({
    where: { productId },
  });
  await prisma.catalogMigrationSuggestion.deleteMany({
    where: { storeId, productId },
  });
  await prisma.product.updateMany({
    where: { id: productId },
    data: { shippingProfileId: null },
  });
  await prisma.categoryCatalogOption.deleteMany({
    where: { categoryId },
  });
  await prisma.catalogOptionValue.deleteMany({
    where: { storeId },
  });
  await prisma.catalogOption.deleteMany({ where: { storeId } });
  await prisma.shippingProfile.deleteMany({ where: { storeId } });
  await prisma.category.updateMany({
    where: { id: legacyCategoryId },
    data: { name: "Categoría E2E anterior", slug: "categoria-e2e-anterior" },
  });
  await prisma.type.updateMany({
    where: { id: legacyTypeId },
    data: { name: "Tipo E2E anterior", slug: "tipo-e2e-anterior" },
  });

  await prisma.type.upsert({
    where: { id: typeId },
    update: { name: "📦 Tipo E2E", icon: null, slug: "tipo-e2e", storeId },
    create: {
      id: typeId,
      name: "📦 Tipo E2E",
      slug: "tipo-e2e",
      storeId,
    },
  });
  await prisma.category.upsert({
    where: { id: categoryId },
    update: {
      name: "✏️ Categoría E2E",
      icon: null,
      slug: "categoria-e2e",
      storeId,
      typeId,
    },
    create: {
      id: categoryId,
      name: "✏️ Categoría E2E",
      slug: "categoria-e2e",
      storeId,
      typeId,
    },
  });
  await prisma.size.upsert({
    where: { id: sizeId },
    update: { name: "M", value: "M-P", storeId },
    create: { id: sizeId, name: "M", value: "M-P", storeId },
  });
  await prisma.color.upsert({
    where: { id: colorId },
    update: { name: "E2E", value: "e2e", storeId },
    create: { id: colorId, name: "E2E", value: "e2e", storeId },
  });
  await prisma.design.upsert({
    where: { id: designId },
    update: { name: "E2E", storeId },
    create: { id: designId, name: "E2E", storeId },
  });
  await prisma.product.upsert({
    where: { id: productId },
    update: {
      storeId,
      categoryId,
      sizeId,
      colorId,
      designId,
      name: "Producto feria E2E",
      description: "Producto exclusivo para las pruebas E2E.",
      slug: "producto-feria-e2e",
      sku: "E2E-FAIR-PRODUCT",
      stock: 20,
      price: 10000,
      acqPrice: 4000,
      isArchived: false,
    },
    create: {
      id: productId,
      storeId,
      categoryId,
      sizeId,
      colorId,
      designId,
      name: "Producto feria E2E",
      description: "Producto exclusivo para las pruebas E2E.",
      slug: "producto-feria-e2e",
      sku: "E2E-FAIR-PRODUCT",
      stock: 20,
      price: 10000,
      acqPrice: 4000,
    },
  });
  await prisma.product.upsert({
    where: { id: archivedProductId },
    update: {
      storeId,
      categoryId,
      sizeId,
      colorId,
      designId,
      name: "Producto archivado E2E",
      description: "Producto archivado que no debe mostrarse en la tienda.",
      slug: "producto-archivado-e2e",
      sku: "E2E-ARCHIVED-PRODUCT",
      stock: 5,
      price: 12000,
      acqPrice: 5000,
      isArchived: true,
    },
    create: {
      id: archivedProductId,
      storeId,
      categoryId,
      sizeId,
      colorId,
      designId,
      name: "Producto archivado E2E",
      description: "Producto archivado que no debe mostrarse en la tienda.",
      slug: "producto-archivado-e2e",
      sku: "E2E-ARCHIVED-PRODUCT",
      stock: 5,
      price: 12000,
      acqPrice: 5000,
      isArchived: true,
    },
  });
  await prisma.category.deleteMany({ where: { id: legacyCategoryId } });
  await prisma.type.deleteMany({ where: { id: legacyTypeId } });
  await prisma.inventoryMovement.deleteMany({
    where: { storeId, productId },
  });

  console.log(`Tienda E2E preparada: ${storeId}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
