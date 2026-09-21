import { fakerES_MX as faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";

import { collectUnique, uniqueSlug } from "./seed-helpers";

const CATEGORY_COUNT = 20;

const getCategories = async (
  storeId: string,
  prismadb: PrismaClient,
): Promise<Prisma.CategoryCreateManyInput[]> => {
  // Los tipos se piden una vez, no una por categoría.
  const types = await prismadb.type.findMany({
    where: { storeId },
    select: { id: true },
  });
  if (types.length === 0) {
    throw new Error("Siembra los tipos antes que las categorías.");
  }

  const names = collectUnique(CATEGORY_COUNT, () => faker.commerce.department());
  const slugs = new Set<string>();
  return names.map((name, index) => ({
    name,
    // `slug` tiene `@default("")` y `@@unique([storeId, slug])`: sin esto las
    // veinte categorías entran con la cadena vacía y la segunda choca.
    slug: uniqueSlug(name, slugs, `categoria-${index + 1}`),
    typeId: types[Math.floor(Math.random() * types.length)].id,
    storeId,
  }));
};

export async function seedCategories(storeId: string, prismadb: PrismaClient) {
  const categories = await getCategories(storeId, prismadb);

  await prismadb.category.createMany({
    data: categories,
  });

  console.log(`Categories seeded successfully! (${categories.length})`);
}
