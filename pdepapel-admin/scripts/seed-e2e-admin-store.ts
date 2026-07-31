import { PrismaClient } from "@prisma/client";

const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";

if (!clerkUserId) {
  throw new Error(
    "E2E_ADMIN_CLERK_USER_ID es obligatoria para preparar la tienda de pruebas.",
  );
}

const prisma = new PrismaClient();

async function main() {
  await prisma.store.upsert({
    where: { id: storeId },
    update: {
      name: "P de Papel E2E",
      userId: clerkUserId!,
    },
    create: {
      id: storeId,
      name: "P de Papel E2E",
      userId: clerkUserId!,
    },
  });

  console.log(`Tienda E2E preparada: ${storeId}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
