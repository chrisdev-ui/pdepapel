import prismadb from "../lib/prismadb";

async function main() {
  try {
    console.log("Verifying OrderItem schema...");
    const orders = await prismadb.order.findMany({
      take: 1,
      select: {
        id: true,
        orderItems: {
          select: {
            name: true,
            sku: true,
            isCustom: true,
          },
        },
      },
    });
    console.log("Successfully fetched orders with new columns:", orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
  } finally {
    process.exit();
  }
}

main();
