import { PrismaClient } from "@prisma/client";
import { calculateOrderFinancials } from "../lib/financial";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting financial data migration...");

  // 1. Migrate Orders
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PAID", "SENT"] },
      // Only migrate orders that don't have financial data yet
      netProfit: null,
    },
    include: {
      payment: true,
      shipping: true,
      orderItems: {
        include: {
          product: true,
        },
      },
    },
  });

  console.log(`Found ${orders.length} completed orders to migrate.`);

  let ordersMigrated = 0;
  for (const order of orders) {
    try {
      const paymentMethod = order.payment?.method || undefined;
      const shippingCost = order.shipping?.cost || 0;

      const financials = await calculateOrderFinancials(
        order,
        paymentMethod,
        shippingCost,
        prisma,
      );

      await prisma.order.update({
        where: { id: order.id },
        data: {
          totalProductCost: financials.totalProductCost,
          gatewayFee: financials.gatewayFee,
          shippingCost: financials.shippingCost,
          netProfit: financials.netProfit,
          profitMarginPct: financials.profitMarginPct,
          paidAt: order.paidAt || order.updatedAt, // Fallback for existing orders
        },
      });
      ordersMigrated++;
      if (ordersMigrated % 50 === 0) {
        console.log(`Migrated ${ordersMigrated}/${orders.length} orders...`);
      }
    } catch (error) {
      console.error(`Failed to migrate order ${order.id}:`, error);
    }
  }

  console.log(`Successfully migrated ${ordersMigrated} orders.`);

  // 2. Migrate Products (ABC Classification)
  console.log("Recalculating ABC classification for all stores...");

  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });

  for (const store of stores) {
    console.log(`Processing store: ${store.name} (${store.id})`);

    // Calculate total net profit for the store in the last 90 days to determine A/B/C thresholds
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      include: {
        orderItems: {
          where: {
            order: {
              status: { in: ["PAID", "SENT"] },
              createdAt: {
                gte: ninetyDaysAgo,
              },
            },
          },
          include: {
            order: {
              select: {
                netProfit: true,
                total: true,
                totalProductCost: true,
                shippingCost: true,
                gatewayFee: true,
              },
            },
          },
        },
      },
    });

    console.log(
      `Found ${products.length} products to classify in store ${store.name}`,
    );

    // Calculate profit contribution per product
    const productProfits = products.map((product) => {
      let profit = 0;
      for (const item of product.orderItems) {
        // Approximate profit contribution of this specific item to the order
        // by taking the item's margin relative to the order's net profit
        const itemRevenue = Number(item.price) * item.quantity;
        const itemCost = Number(product.acqPrice || 0) * item.quantity;
        // Simplified estimation for historical data
        profit += Math.max(0, itemRevenue - itemCost);
      }
      return {
        id: product.id,
        profit,
      };
    });

    // Sort descending by profit
    productProfits.sort((a, b) => b.profit - a.profit);

    const totalStoreProfit = productProfits.reduce(
      (sum, p) => sum + p.profit,
      0,
    );

    let cumulativeProfit = 0;
    let productsUpdated = 0;

    for (const p of productProfits) {
      cumulativeProfit += p.profit;
      const cumulativePercentage =
        totalStoreProfit > 0 ? (cumulativeProfit / totalStoreProfit) * 100 : 0;

      let classification = "C";
      if (cumulativePercentage <= 70) {
        classification = "A";
      } else if (cumulativePercentage <= 90) {
        classification = "B";
      }

      await prisma.product.update({
        where: { id: p.id },
        data: { abcClassification: classification },
      });
      productsUpdated++;
    }
    console.log(
      `Updated ABC classification for ${productsUpdated} products in ${store.name}.`,
    );
  }

  console.log("Data migration complete!");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
