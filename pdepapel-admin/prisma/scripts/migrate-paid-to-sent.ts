import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log(
    "Starting migration: Updating PAID orders to SENT based on Shipping Status...",
  );

  // Fetch all PAID orders with their shipping status
  const orders = await prisma.order.findMany({
    where: {
      status: "PAID",
      shipping: {
        isNot: null,
      },
    },
    include: {
      shipping: true,
    },
  });

  console.log(`Found ${orders.length} PAID orders with shipping info.`);

  let updatedCount = 0;

  for (const order of orders) {
    // Logic: If shipping status is NOT default ('Preparing'), assume it's moving -> Update to SENT
    if (order.shipping && order.shipping.status !== "Preparing") {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "SENT" },
      });
      updatedCount++;
      console.log(
        `✅ Updated Order ${order.orderNumber} to SENT (Shipping Status: ${order.shipping.status})`,
      );
    }
  }

  console.log(
    `Migration complete. Updated ${updatedCount} orders from PAID to SENT.`,
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
