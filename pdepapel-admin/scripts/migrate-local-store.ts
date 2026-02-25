import { PrismaClient, OrderStatus } from "@prisma/client";

const prisma = new PrismaClient();

const DEV_CLERK_USER_ID = "user_2XSY1l7Sozl7jvpj3UMxNNUxwlZ";

async function main() {
  console.log("🚀 Iniciando migración de datos locales...");

  console.log(
    `\n🔄 Actualizando propietario de la tienda a: ${DEV_CLERK_USER_ID}`,
  );
  const stores = await prisma.store.updateMany({
    data: {
      userId: DEV_CLERK_USER_ID,
    },
  });
  console.log(`✅ ${stores.count} Tienda(s) reasignada(s) exitosamente.`);

  console.log(
    "\n📊 Calculando datos financieros históricos para el Dashboard BI...",
  );

  // Using 'any' to bypass Prisma strict types during local execution since the target DB
  // might not match the Prisma client exactly yet during a manual dev export/import loop.
  const paidOrders = await (prisma.order as any).findMany({
    where: {
      status: { in: [OrderStatus.PAID, OrderStatus.SENT] },
    },
    include: {
      orderItems: {
        include: { product: true },
      },
    },
  });

  let updatedOrdersCount = 0;

  for (const order of paidOrders) {
    // Force recalculate in all runs
    let totalProductCost = 0;
    for (const item of order.orderItems) {
      // Fallback to 0 if the product has no acquisition price recorded
      totalProductCost += (item.product.acqPrice || 0) * item.quantity;
    }

    const exactGatewayFee = order.total * 0.0319 + 1000;
    const exactShippingCost = order.shippingCost || 0;
    const exactNetProfit =
      order.total - exactGatewayFee - exactShippingCost - totalProductCost;

    await prisma.$executeRawUnsafe(`
        UPDATE \`Order\` 
        SET 
          netProfit = ${exactNetProfit}, 
          gatewayFee = ${exactGatewayFee}, 
          paidAt = '${(order.paidAt || order.createdAt).toISOString().slice(0, 19).replace("T", " ")}'
        WHERE id = '${order.id}'
      `);
    updatedOrdersCount++;
  }

  console.log(
    `✅ ${updatedOrdersCount} Órdenes históricas actualizadas con Beneficio Neto (Net Profit).`,
  );
  console.log(
    "\n🎉 Migración Local Completada con Éxito. Ya puedes probar tu dashboard de Business Intelligence.\n",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
