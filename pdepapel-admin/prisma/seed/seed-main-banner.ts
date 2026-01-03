import { fakerES_MX as faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";

const getMainBanner = (storeId: string) => {
  return {
    title: faker.person.jobTitle(),
    label1: faker.lorem.sentence(),
    label2: faker.lorem.sentence(),
    highlight: faker.lorem.word(),
    callToAction: "#",
    imageUrl: faker.image.urlLoremFlickr({
      width: 1920,
      height: 1080,
    }),
    storeId,
  };
};

export async function seedMainBanner(storeId: string, prismadb: PrismaClient) {
  const mainBanner = getMainBanner(storeId);

  await prismadb.mainBanner.create({ data: mainBanner });

  console.log("Main Banner seeded successfully!");
}
