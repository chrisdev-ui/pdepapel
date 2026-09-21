import { fakerES_MX as faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";

import { collectUnique } from "./seed-helpers";

/**
 * `Color` lleva `@@unique([storeId, name])`.
 *
 * Esto pedía 25 colores con un `Set` de objetos literales: cada objeto es una
 * referencia distinta, así que el `Set` no quitaba ni un repetido —solo servía
 * para contar hasta 25— y el `createMany` chocaba contra ese índice. Nombres
 * distintos hay de sobra (`faker.color.human()` da 30); lo que faltaba era
 * deduplicar por nombre, que es lo que ahora hace `collectUnique`.
 */
const getColors = (
  storeId: string,
): Prisma.ColorCreateManyInput[] =>
  collectUnique(25, () => faker.color.human()).map((name) => ({
    name,
    value: faker.color.rgb(),
    storeId,
  }));

export async function seedColors(storeId: string, prismadb: PrismaClient) {
  const colors = getColors(storeId);

  await prismadb.color.createMany({
    data: colors,
  });

  console.log(`Colors seeded successfully! (${colors.length})`);
}
