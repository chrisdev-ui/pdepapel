import { fakerES_MX as faker, simpleFaker } from "@faker-js/faker";
import { DiscountType, PrismaClient } from "../generated/prisma/client";
import { currencyFormatter } from "../../lib/utils";

const NUMBER_OF_COUPONS = 25;

// Predefined coupon codes for realistic testing
const PREDEFINED_CODES = [
  "WELCOME10",
  "SAVE20",
  "FIRSTBUY",
  "STUDENT15",
  "WEEKEND25",
  "FLASH30",
  "VIP50",
  "NEWCUSTOMER",
  "BLACKFRIDAY",
  "CYBERMONDAY",
  "SUMMER2024",
  "BACKTOSCHOOL",
  "HOLIDAY20",
  "EASTER15",
  "MOTHERSDAY",
];

// Generate additional random codes
const generateRandomCode = (length: number = 8): string => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

export async function seedCoupons(storeId: string, prismadb: PrismaClient) {
  console.log("Starting to seed coupons...");

  // Clear existing coupons for this store
  await prismadb.coupon.deleteMany({
    where: { storeId },
  });

  const coupons = [];

  // Create coupons with predefined codes
  for (
    let i = 0;
    i < Math.min(PREDEFINED_CODES.length, NUMBER_OF_COUPONS);
    i++
  ) {
    const code = PREDEFINED_CODES[i];
    const type =
      Math.random() > 0.6 ? DiscountType.PERCENTAGE : DiscountType.FIXED;

    // Set realistic discount amounts
    let amount: number;
    if (type === DiscountType.PERCENTAGE) {
      amount = simpleFaker.number.int({ min: 5, max: 50 }); // 5% to 50%
    } else {
      amount = simpleFaker.number.int({ min: 2000, max: 20000 }); // $2,000 to $20,000 COP
    }

    // Generate realistic date ranges
    const startDate = faker.date.recent({ days: 30 }); // Started within last 30 days
    const endDate = new Date(
      startDate.getTime() +
        simpleFaker.number.int({ min: 1, max: 60 }) * 24 * 60 * 60 * 1000,
    ); // Ends within 60 days from start

    // Set min order values (some coupons require minimum purchase)
    let minOrderValue = 0;
    if (Math.random() > 0.4) {
      // 60% of coupons have minimum order requirement
      minOrderValue = simpleFaker.number.int({ min: 10000, max: 100000 }); // $10,000 to $100,000 COP
    }

    // Set max uses (some are unlimited)
    let maxUses = null;
    if (Math.random() > 0.3) {
      // 70% have usage limits
      maxUses = simpleFaker.number.int({ min: 10, max: 500 });
    }

    // Generate realistic used counts (0 to 80% of max uses)
    let usedCount = 0;
    if (maxUses && Math.random() > 0.2) {
      // 80% of limited coupons have some usage
      usedCount = simpleFaker.number.int({
        min: 0,
        max: Math.floor(maxUses * 0.8),
      });
    }

    // 90% of coupons are active
    const isActive = Math.random() > 0.1;

    coupons.push({
      storeId,
      code,
      type,
      amount,
      startDate,
      endDate,
      maxUses,
      usedCount,
      isActive,
      minOrderValue,
    });
  }

  // Create additional coupons with random codes
  const remainingCoupons = NUMBER_OF_COUPONS - PREDEFINED_CODES.length;
  for (let i = 0; i < remainingCoupons; i++) {
    let code: string;
    do {
      code = generateRandomCode(simpleFaker.number.int({ min: 6, max: 10 }));
    } while (coupons.some((c) => c.code === code));

    const type =
      Math.random() > 0.5 ? DiscountType.PERCENTAGE : DiscountType.FIXED;

    let amount: number;
    if (type === DiscountType.PERCENTAGE) {
      amount = simpleFaker.number.int({ min: 10, max: 75 });
    } else {
      amount = simpleFaker.number.int({ min: 5000, max: 50000 });
    }

    const startDate = faker.date.recent({ days: 60 });
    // Manually add 1 to 90 days to startDate for endDate
    const endDate = new Date(
      startDate.getTime() +
        simpleFaker.number.int({ min: 1, max: 90 }) * 24 * 60 * 60 * 1000,
    );

    let minOrderValue = 0;
    if (Math.random() > 0.5) {
      minOrderValue = simpleFaker.number.int({ min: 15000, max: 80000 });
    }

    let maxUses = null;
    if (Math.random() > 0.4) {
      maxUses = simpleFaker.number.int({ min: 5, max: 200 });
    }

    let usedCount = 0;
    if (maxUses && Math.random() > 0.3) {
      usedCount = simpleFaker.number.int({
        min: 0,
        max: Math.floor(maxUses * 0.6),
      });
    }

    const isActive = Math.random() > 0.15;

    coupons.push({
      storeId,
      code,
      type,
      amount,
      startDate,
      endDate,
      maxUses,
      usedCount,
      isActive,
      minOrderValue,
    });
  }

  // Batch create coupons
  await prismadb.coupon.createMany({
    data: coupons,
  });

  console.log(
    `Coupons seeded successfully! Created ${coupons.length} coupons.`,
  );

  // Log some sample coupons for testing
  console.log("\n📋 Sample coupons for testing:");
  const sampleCoupons = coupons.slice(0, 5);
  sampleCoupons.forEach((coupon) => {
    const discountText =
      coupon.type === DiscountType.PERCENTAGE
        ? `${coupon.amount}%`
        : `${currencyFormatter(coupon.amount)}`;
    const minOrderText =
      coupon.minOrderValue > 0
        ? ` (min: ${currencyFormatter(coupon.minOrderValue)})`
        : "";
    console.log(
      `  • ${coupon.code}: ${discountText} off${minOrderText} - ${coupon.isActive ? "Active" : "Inactive"}`,
    );
  });
}
