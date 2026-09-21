import { fakerES_MX as faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";

import { collectUnique } from "./seed-helpers";

const getDesigns = (
  storeId: string,
): Prisma.DesignCreateManyInput | Prisma.DesignCreateManyInput[] => {
  // `Design` lleva `@@unique([storeId, name])`. El `Set<string>` sí deduplicaba
  // bien, pero `faker.commerce.productMaterial()` da 11 valores y aquí se piden
  // 10: un margen de uno. El día que faker recorte esa lista, el bucle sin tope
  // se queda girando para siempre en vez de fallar.
  return collectUnique(10, () => faker.commerce.productMaterial()).map((design) => ({
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
