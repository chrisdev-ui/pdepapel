import { fakerES_MX as faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";

const getRandomTypeId = async (prismadb: PrismaClient, storeId: string) => {
  const types = await prismadb.type.findMany({ where: { storeId } });
  const randomIndex = Math.floor(Math.random() * types.length);
  return types[randomIndex].id;
};

const getCategories = async (
  storeId: string,
  prismadb: PrismaClient,
): Promise<
  Prisma.CategoryCreateManyInput | Prisma.CategoryCreateManyInput[]
> => {
  const categorySet = new Set<string>();
  const categories: Prisma.CategoryCreateManyInput[] = [];

  while (categorySet.size < 20) {
    categorySet.add(faker.commerce.department());
  }

  for (let i = 0; i < categorySet.size; i++) {
    const typeId = await getRandomTypeId(prismadb, storeId);
    categories.push({
      name: Array.from(categorySet)[i],
      typeId,
      storeId,
    });
  }

  return categories;
};

export async function seedCategories(storeId: string, prismadb: PrismaClient) {
  const categories = await getCategories(storeId, prismadb);

  await prismadb.category.createMany({
    data: categories,
  });

  console.log("Categories seeded successfully!");
}
