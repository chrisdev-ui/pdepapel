import { fakerES_MX as faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";

const getBannerData = (
  storeId: string,
): Prisma.BannerCreateManyInput | Prisma.BannerCreateManyInput[] => {
  return Array(5)
    .fill(0)
    .map(() => ({
      imageUrl: faker.image.urlLoremFlickr({
        width: 1920,
        height: 1080,
      }),
      callToAction: "#",
      storeId,
    }));
};

export async function seedBanners(storeId: string, prismadb: PrismaClient) {
  const bannersData = getBannerData(storeId);

  await prismadb.banner.createMany({
    data: bannersData,
  });

  console.log("Banners seeded successfully!");
}
