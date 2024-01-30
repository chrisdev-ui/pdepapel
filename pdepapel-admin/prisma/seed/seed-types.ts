import { fakerES_MX as faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";

const getTypes = (
  storeId: string,
): Prisma.TypeCreateManyInput | Prisma.TypeCreateManyInput[] => {
  const typesSet = new Set<string>();

  while (typesSet.size < 10) {
    typesSet.add(faker.commerce.productAdjective());
  }

  const types = Array.from(typesSet).map((type) => ({
    name: type,
    storeId,
  }));

  return types;
};

export async function seedTypes(storeId: string, prismadb: PrismaClient) {
  const types = getTypes(storeId);

  await prismadb.type.createMany({
    data: types,
  });

  console.log("Types seeded successfully!");
}
