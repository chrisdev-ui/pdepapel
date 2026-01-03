import { fakerES_MX as faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "../generated/prisma/client";

const getDesigns = (
  storeId: string,
): Prisma.DesignCreateManyInput | Prisma.DesignCreateManyInput[] => {
  const designsSet = new Set<string>();
  while (designsSet.size < 10) {
    designsSet.add(faker.commerce.productMaterial());
  }
  return Array.from(designsSet).map((design) => ({
    name: design,
    storeId,
  }));
};

export async function seedDesigns(storeId: string, prismadb: PrismaClient) {
  const designs = getDesigns(storeId);

  // Insert new designs
  await prismadb.design.createMany({
    data: designs,
  });

  console.log("Designs seeded successfully!");
}
