import { PrismaClient } from "@prisma/client";
import { parsePhoneNumber } from "react-phone-number-input";

const prisma = new PrismaClient();

async function main() {
  console.log("☎️ Starting Phone Number Migration...");
  console.log("----------------------------------------");

  // 1. Migrate Stores
  console.log("\n🏪 Migrating Stores...");
  const stores = await prisma.store.findMany();
  let storesUpdated = 0;
  let storesSkipped = 0;

  for (const store of stores) {
    if (!store.phone) {
      storesSkipped++;
      continue;
    }

    // Default to Colombia (CO) if parsing fails without country
    const phoneNumber = parsePhoneNumber(store.phone, "CO");
    let formattedPhone = store.phone;

    if (phoneNumber) {
      formattedPhone = phoneNumber.format("E.164") as string;
    } else {
      console.log(
        `   [SKIP] Invalid formatting for Store ${store.name}: ${store.phone}`,
      );
      storesSkipped++;
      continue;
    }

    if (formattedPhone !== store.phone) {
      console.log(
        `   [UPDATE] Store ${store.name}: ${store.phone} -> ${formattedPhone}`,
      );
      await prisma.$transaction(async (tx) => {
        await tx.store.update({
          where: { id: store.id },
          data: { phone: formattedPhone },
        });
      });
      storesUpdated++;
    } else {
      storesSkipped++;
    }
  }
  console.log(
    `✅ Stores Processed: ${storesUpdated} updated, ${storesSkipped} skipped/clean.`,
  );

  // 2. Migrate Orders
  console.log("\n📦 Migrating Orders...");
  const orders = await prisma.order.findMany();
  console.log(`Found ${orders.length} orders to process.`);

  let ordersUpdated = 0;
  let ordersSkipped = 0;
  const spinnerChars = ["|", "/", "-", "\\"];
  let spinnerIndex = 0;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];

    // Update spinner
    if (i % 10 === 0) {
      const spinner = spinnerChars[spinnerIndex++ % spinnerChars.length];
      const progress = `[${i + 1}/${orders.length}]`;
      process.stdout.write(
        `\r${spinner} ${progress} Processing Order #${order.orderNumber}          `,
      );
    }

    if (!order.phone) {
      ordersSkipped++;
      continue;
    }

    const phoneNumber = parsePhoneNumber(order.phone, "CO");
    let formattedPhone = order.phone;

    if (phoneNumber) {
      formattedPhone = phoneNumber.format("E.164") as string;
    } else {
      // Log only if it looks like a real attempt at a number (length > 5) to avoid noise
      if (order.phone.length > 5) {
        // Clear line before logging error so it doesn't mess up spinner
        process.stdout.write("\r");
        console.log(
          `   [SKIP] Invalid for Order ${order.orderNumber}: ${order.phone}`,
        );
      }
      ordersSkipped++;
      continue;
    }

    if (formattedPhone !== order.phone) {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { phone: formattedPhone },
        });
      });
      ordersUpdated++;
    } else {
      ordersSkipped++;
    }
  }

  process.stdout.write(`\rDone.                                      \n`);
  console.log(
    `✅ Orders Processed: ${ordersUpdated} updated, ${ordersSkipped} skipped/clean.`,
  );

  console.log("\n----------------------------------------");
  console.log("🎉 Migration Complete!");
}

main()
  .catch((e) => {
    console.error("\nError during migration:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
