import { fakerES_MX as faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "../generated/prisma/client";

const getBillboards = (
  storeId: string,
): Prisma.BillboardCreateManyInput | Prisma.BillboardCreateManyInput[] => {
  return Array(5)
    .fill(0)
    .map(() => ({
      storeId,
      label: faker.lorem.word(),
      imageUrl: faker.image.urlLoremFlickr({
        width: 1920,
        height: 1080,
      }),
      title: faker.lorem.sentence(),
      redirectUrl: "#",
    }));
};

export async function seedBillboards(storeId: string, prismadb: PrismaClient) {
  const billboards = getBillboards(storeId);

  await prismadb.billboard.createMany({
    data: billboards,
  });

  console.log("Billboards seeded successfully!");
}
