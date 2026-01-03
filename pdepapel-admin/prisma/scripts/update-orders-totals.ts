import { Prisma, PrismaClient } from "@prisma/client";
import prismadb from "../../lib/prismadb";

function calculateOrderTotals(
  orderItems: any[],
  config?: {
    discount?: any;
    coupon?: any;
  },
): any {
  const subtotal = orderItems.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );

  let discount = 0;
  if (config?.discount) {
    discount =
      config.discount.type === "PERCENTAGE"
        ? (subtotal * config.discount.amount) / 100
        : Math.min(config.discount.amount, subtotal);
  }

  let couponDiscount = 0;
  if (config?.coupon) {
    const afterDiscount = subtotal - discount;
    couponDiscount =
      config.coupon.type === "PERCENTAGE"
        ? (afterDiscount * config.coupon.amount) / 100
        : Math.min(config.coupon.amount, afterDiscount);
  }

  const total = subtotal - discount - couponDiscount;

  return {
    subtotal,
    discount,
    couponDiscount,
    total,
  };
}

async function main() {
  try {
    console.log("Starting orders update...");

    const orders = await prismadb.order.findMany({
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    console.log(`Found ${orders.length} orders to update. Updating totals...`);

    let successCount = 0;

    for (const order of orders) {
      try {
        const totals = calculateOrderTotals(order.orderItems);

        await prismadb.order.update({
          where: { id: order.id },
          data: {
            subtotal: totals.subtotal,
            total: totals.total,
            discount: 0,
            couponDiscount: 0,
            discountType: null,
            discountReason: null,
            couponId: null,
          },
        });

        successCount++;

        // Add a small delay between updates
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (successCount % 10 === 0) {
          console.log(`Processed ${successCount} of ${orders.length} orders`);
        }
      } catch (error) {
        console.error(`Error updating order ${order.id}:`, error);
      }
    }

    console.log(`Successfully updated ${successCount} orders`);
    console.log("Migration finished successfully!");
  } catch (error) {
    console.error("Error updating orders:", error);
    process.exit(1);
  } finally {
    await prismadb.$disconnect();
  }
}

main()
  .then(() => {
    console.log("Script finished successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error running script:", error);
    process.exit(1);
  });
