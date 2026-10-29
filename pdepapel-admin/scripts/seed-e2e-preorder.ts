import { assertTestDatabaseEnv } from "./lib/test-database.mjs";
import { blockOutboundNetwork, NOT_STUBBED, TEST_ENV_STUBS } from "./lib/test-isolation.mjs";

/**
 * Un producto en preventa con anticipo para la e2e local de la tienda
 * (`tests/e2e/local/preorder-deposit.spec.ts`): $160.000, anticipo fijo de
 * $30.000 por unidad, sin tope ni fecha. Solo contra `pdepapel_test`.
 *
 *   node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs npx tsx scripts/seed-e2e-preorder.ts seed|clean
 *
 * También, para que la e2e compruebe lo que la tienda dejó en la base:
 * `inspect` (lista de espera y pedidos del producto, sin datos de contacto),
 * `deposit <orderId>` (el anticipo anotado con el mismo `settleDepositPayment`
 * que usa «Marcar anticipo recibido» en el panel), `installment <orderId>
 * <valor>` (el abono con el mismo `recordInstallment` de «Registrar abono») y
 * `archive` / `unarchive`.
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
  } else if (mode === "inspect") {
    const product = await db.product.findUnique({ where: { id: PRODUCT_ID }, select: { isArchived: true } });
    const waitlist = await db.preorderWaitlistEntry.findMany({
      where: { productId: PRODUCT_ID },
      select: { name: true, status: true, channel: true, phone: true, email: true, consentVersion: true },
      orderBy: { createdAt: "asc" },
    });
    const orders = await db.order.findMany({
      where: { orderItems: { some: { productId: PRODUCT_ID } } },
      select: { id: true, status: true, paymentPlan: true, depositAmount: true, total: true, paidAt: true },
      orderBy: { createdAt: "asc" },
    });
    console.log(
      JSON.stringify({
        isArchived: product?.isArchived ?? null,
        waitlist: waitlist.map(({ phone, email, ...entry }) => ({ ...entry, hasPhone: Boolean(phone), hasEmail: Boolean(email) })),
        orders: orders.map(({ paidAt, ...order }) => ({ ...order, paid: paidAt !== null })),
      }),
    );
  } else if (mode === "deposit") {
    const orderId = process.argv[3];
    if (!orderId) throw new Error("Falta el id del pedido");
    await import("./lib/allow-server-only.cjs");
    const { settleDepositPayment } = await import("../lib/order-payments");
    const result = await settleDepositPayment({
      orderId,
      storeId,
      amount: 30000,
      method: "BankTransfer",
      paidAt: new Date(),
      source: "manual",
      createdBy: "e2e",
      note: null,
      notifyCustomer: false,
    });
    console.log(JSON.stringify({ outcome: result.outcome }));
  } else if (mode === "installment") {
    const [orderId, amount] = process.argv.slice(3);
    if (!orderId || !amount) throw new Error("Faltan el id del pedido y el valor del abono");
    await import("./lib/allow-server-only.cjs");
    const { recordInstallment } = await import("../lib/order-payments");
    const result = await recordInstallment({
      orderId,
      storeId,
      amount: Number(amount),
      method: "CASH",
      paidAt: new Date(),
      createdBy: "e2e",
      note: null,
      notifyCustomer: false,
    });
    console.log(JSON.stringify({ paid: result.paid, remaining: result.remaining }));
  } else if (mode === "archive" || mode === "unarchive") {
    await db.product.update({ where: { id: PRODUCT_ID }, data: { isArchived: mode === "archive" } });
    console.log(JSON.stringify({ isArchived: mode === "archive" }));
  } else {
    throw new Error("Modo desconocido: seed | clean | inspect | deposit <orderId> | installment <orderId> <valor> | archive | unarchive");
  }
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
