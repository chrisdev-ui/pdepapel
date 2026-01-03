import { PrismaClient } from "@prisma/client";
import prismadb from "../lib/prismadb";

const prisma = prismadb;

async function cleanupOrphanedShipments() {
  try {
    console.log("🔍 Searching for orphaned shipping records...\n");

    // Find all shipments
    const allShipments = await prisma.shipping.findMany({
      select: {
        id: true,
        orderId: true,
        status: true,
        courier: true,
        trackingCode: true,
        createdAt: true,
      },
    });

    console.log(`📦 Total shipping records: ${allShipments.length}`);

    // Check each shipment to see if its order exists
    const orphanedShipments = [];

    for (const shipment of allShipments) {
      const orderExists = await prisma.order.findUnique({
        where: { id: shipment.orderId },
        select: { id: true },
      });

      if (!orderExists) {
        orphanedShipments.push(shipment);
      }
    }

    console.log(
      `\n❌ Found ${orphanedShipments.length} orphaned shipping records:\n`,
    );

    if (orphanedShipments.length === 0) {
      console.log("✅ No orphaned shipping records found. Database is clean!");
      return;
    }

    // Display details
    orphanedShipments.forEach((shipment, index) => {
      console.log(`${index + 1}. Shipping ID: ${shipment.id}`);
      console.log(`   Order ID (deleted): ${shipment.orderId}`);
      console.log(`   Status: ${shipment.status}`);
      console.log(`   Courier: ${shipment.courier || "N/A"}`);
      console.log(`   Tracking: ${shipment.trackingCode || "N/A"}`);
      console.log(`   Created: ${shipment.createdAt}`);
      console.log("");
    });

    // Delete orphaned shipments one by one
    console.log(
      `\n🗑️  Deleting ${orphanedShipments.length} orphaned shipments...\n`,
    );

    let deletedCount = 0;
    for (const shipment of orphanedShipments) {
      try {
        await prisma.shipping.delete({
          where: { id: shipment.id },
        });
        deletedCount++;
        console.log(`✓ Deleted shipping ${shipment.id}`);
      } catch (error) {
        console.error(`✗ Failed to delete shipping ${shipment.id}:`, error);
      }
    }

    console.log(
      `\n✅ Successfully deleted ${deletedCount} out of ${orphanedShipments.length} orphaned shipping records!`,
    );
  } catch (error) {
    console.error("❌ Error cleaning up orphaned shipments:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupOrphanedShipments()
  .then(() => {
    console.log("\n✨ Cleanup completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Cleanup failed:", error);
    process.exit(1);
  });
