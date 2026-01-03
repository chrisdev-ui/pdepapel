import { PrismaClient } from "../generated/prisma/client";

const getSuppliers = (storeId: string) => {
  return [
    { name: "P de Papel", storeId },
    { name: "Papelería P de Papel", storeId },
  ];
};

export async function seedSuppliers(storeId: string, prismadb: PrismaClient) {
  const suppliers = getSuppliers(storeId);

  await prismadb.supplier.createMany({
    data: suppliers,
  });

  console.log("Suppliers seeded successfully!");
}
