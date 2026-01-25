import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const paidCount = await prisma.order.count({
    where: { status: "PAID" },
  });
  const sentCount = await prisma.order.count({
    where: { status: "SENT" },
  });

  console.log(`Verification:`);
  console.log(`PAID orders remaining: ${paidCount}`);
  console.log(`SENT orders total: ${sentCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
