import { assertTestDatabaseEnv } from "./lib/test-database.mjs";
import { blockOutboundNetwork, NOT_STUBBED, TEST_ENV_STUBS } from "./lib/test-isolation.mjs";

/**
 * Un producto en preventa con anticipo para la e2e local de la tienda
 * (`tests/e2e/local/preorder-deposit.spec.ts`): $160.000, anticipo fijo de
 * $30.000 por unidad, sin tope ni fecha. Solo contra `pdepapel_test`.
 *
 *   node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs npx tsx scripts/seed-e2e-preorder.ts seed|clean
 */
for (const [name, value] of Object.entries(TEST_ENV_STUBS)) {
  if (!NOT_STUBBED.has(name)) process.env[name] = value;
}
blockOutboundNetwork();

const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const PRODUCT_ID = "e2e-preorder-calendar";
const TEMPLATE = "e2e-fair-product";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasourceUrl: assertTestDatabaseEnv(process.env, "seed-e2e-preorder") });

  const clean = async () => {
    const orders = (await db.orderItem.findMany({ where: { productId: PRODUCT_ID }, select: { orderId: true } })).map((row) => row.orderId);
    await db.orderNotification.deleteMany({ where: { orderId: { in: orders } } });
    await db.orderPayment.deleteMany({ where: { orderId: { in: orders } } });
    await db.paymentWebhookEvent.deleteMany({ where: { orderId: { in: orders } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orders } } });
    await db.shipping.deleteMany({ where: { orderId: { in: orders } } });
    await db.paymentDetails.deleteMany({ where: { orderId: { in: orders } } });
    await db.order.deleteMany({ where: { id: { in: orders } } });
    await db.preorderWaitlistEntry.deleteMany({ where: { productId: PRODUCT_ID } });
    await db.productPresale.deleteMany({ where: { productId: PRODUCT_ID } });
    await db.image.deleteMany({ where: { productId: PRODUCT_ID } });
    await db.product.deleteMany({ where: { id: PRODUCT_ID } });
  };

  const mode = process.argv[2];
  if (mode === "clean") {
    await clean();
    console.log(JSON.stringify({ cleaned: true }));
  } else if (mode === "seed") {
    await clean();
    const template = await db.product.findUniqueOrThrow({ where: { id: TEMPLATE } });
    const product = await db.product.create({
      data: {
        id: PRODUCT_ID,
        storeId,
        name: "Calendario de adviento E2E",
        slug: "calendario-de-adviento-e2e",
        description: "<p>Calendario de prueba con 24 cajitas.</p>",
        stock: 0,
        price: 160000,
        acqPrice: 123778,
        sku: "E2E-PREORDER-CAL",
        categoryId: template.categoryId,
        sizeId: template.sizeId,
        colorId: template.colorId,
        designId: template.designId,
        hasNoProductIdentifier: true,
        images: { create: [{ url: "https://res.cloudinary.com/dsogxa0hj/image/upload/v1/e2e/calendario.png", isMain: true }] },
      },
    });
    await db.productPresale.create({
      data: {
        storeId,
        productId: product.id,
        unitLimit: null,
        expectedArrivalAt: null,
        paymentMode: "DEPOSIT",
        depositType: "FIXED",
        depositValue: 30000,
        termsText: "Unidades según llegada del proveedor.",
        createdBy: "e2e",
      },
    });
    console.log(JSON.stringify({ productId: product.id, slug: product.slug }));
  } else {
    throw new Error("Modo desconocido: seed | clean");
  }
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
