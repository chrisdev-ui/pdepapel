import { fakerES_MX as faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "../generated/prisma/client";

const getColors = (
  storeId: string,
): Prisma.ColorCreateManyInput | Prisma.ColorCreateManyInput[] => {
  const colorsSet = new Set<{ name: string; value: string }>();

  while (colorsSet.size < 25) {
    colorsSet.add({
      name: faker.color.human(),
      value: faker.color.rgb(),
    });
  }

  return Array.from(colorsSet).map((color) => ({
    ...color,
    storeId,
  }));
};

export async function seedColors(storeId: string, prismadb: PrismaClient) {
  const colors = getColors(storeId);

  await prismadb.color.createMany({
    data: colors,
  });

  console.log("Colors seeded successfully!");
}
