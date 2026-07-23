import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { calculateOrderFinancials } from "@/lib/financial";

async function main() {
  console.log("Starting full database financial synchronization for ALL paid/sent orders...");

  const orders = await prismadb.order.findMany({
    where: {
      status: { in: [OrderStatus.PAID, OrderStatus.SENT] },
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

  console.log(`Found ${orders.length} total paid/sent orders in database.`);

  let updatedCount = 0;
  for (const order of orders) {
    try {
      const paymentMethod = order.payment?.method || undefined;
      const shippingCost = Number(order.shipping?.cost || 0);

      const financials = await calculateOrderFinancials(
        order as any,
        paymentMethod,
        shippingCost,
        prismadb,
      );

      await prismadb.order.update({
        where: { id: order.id },
        data: {
          totalProductCost: financials.totalProductCost,
          gatewayFee: financials.gatewayFee,
          shippingCost: financials.shippingCost,
          netProfit: financials.netProfit,
          profitMarginPct: financials.profitMarginPct,
          paidAt: order.paidAt || order.createdAt,
        },
      });

      updatedCount++;
      if (updatedCount % 50 === 0) {
        console.log(`Updated financials for ${updatedCount}/${orders.length} orders...`);
      }
    } catch (err) {
      console.error(`Failed updating order ${order.orderNumber}:`, err);
    }
  }

  console.log(`\n================ SYNC COMPLETE ================`);
  console.log(`Successfully updated ${updatedCount}/${orders.length} orders in database.`);
}

main()
  .catch(console.error)
  .finally(() => prismadb.$disconnect());
