import { Prisma, PrismaClient } from "../generated/prisma/client";

const getSizes = (
  storeId: string,
): Prisma.SizeCreateManyInput | Prisma.SizeCreateManyInput[] => {
  return [
    { name: "Small", value: "S" },
    { name: "Medium", value: "M" },
    { name: "Large", value: "L" },
    { name: "Extra Large", value: "XL" },
    { name: "XXL", value: "XXL" },
  ].map((size) => ({
    ...size,
    storeId,
  }));
};

export async function seedSizes(storeId: string, prismadb: PrismaClient) {
  const sizes = getSizes(storeId);

  await prismadb.size.createMany({
    data: sizes,
  });

  console.log("Sizes seeded successfully!");
}
