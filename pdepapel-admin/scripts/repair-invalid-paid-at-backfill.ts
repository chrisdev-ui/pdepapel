import { OrderStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HISTORICAL_PERIOD_START = new Date("2025-07-01T05:00:00.000Z");
const HISTORICAL_PERIOD_END = new Date("2026-01-01T05:00:00.000Z");
const INVALID_PAID_AT_START = new Date("2026-01-01T05:00:00.000Z");
const INVALID_PAID_AT_END = new Date("2026-02-01T05:00:00.000Z");

const shouldApply = process.argv.includes("--apply");
const storeId = process.env.STORE_ID;

if (!storeId) {
  throw new Error("STORE_ID es requerido");
}

const affectedOrdersWhere = {
  storeId,
  status: {
    in: [OrderStatus.PAID, OrderStatus.SENT],
  },
  createdAt: {
    gte: HISTORICAL_PERIOD_START,
    lt: HISTORICAL_PERIOD_END,
  },
  paidAt: {
    gte: INVALID_PAID_AT_START,
    lt: INVALID_PAID_AT_END,
  },
};

async function main() {
  const affectedOrders = await prisma.order.findMany({
    where: affectedOrdersWhere,
    select: {
      id: true,
      paidAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        affectedOrders: affectedOrders.length,
        paidAtRange: {
          start: INVALID_PAID_AT_START.toISOString(),
          endExclusive: INVALID_PAID_AT_END.toISOString(),
        },
      },
      null,
      2,
    ),
  );

  if (!shouldApply || affectedOrders.length === 0) {
    return;
  }

  const updatedCount = await prisma.$executeRaw`
    UPDATE \`Order\`
    SET \`paidAt\` = NULL
    WHERE \`storeId\` = ${storeId}
      AND \`status\` IN (${OrderStatus.PAID}, ${OrderStatus.SENT})
      AND \`createdAt\` >= ${HISTORICAL_PERIOD_START}
      AND \`createdAt\` < ${HISTORICAL_PERIOD_END}
      AND \`paidAt\` >= ${INVALID_PAID_AT_START}
      AND \`paidAt\` < ${INVALID_PAID_AT_END}
  `;

  if (updatedCount !== affectedOrders.length) {
    throw new Error(
      `Se esperaban ${affectedOrders.length} correcciones, pero se actualizaron ${updatedCount}`,
    );
  }

  console.log(`Se restauraron ${updatedCount} valores paidAt a NULL.`);
}

main()
  .catch((error) => {
    console.error("No fue posible reparar paidAt:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
