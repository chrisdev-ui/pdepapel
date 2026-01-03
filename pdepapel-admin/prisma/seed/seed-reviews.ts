import { fakerES_MX as faker, simpleFaker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "../generated/prisma/client";

const getRandomProductId = async (prismadb: PrismaClient, storeId: string) => {
  const products = await prismadb.product.findMany({ where: { storeId } });
  const randomIndex = Math.floor(Math.random() * products.length);
  return products[randomIndex].id;
};

const getReviewsData = async (
  storeId: string,
  prismadb: PrismaClient,
): Promise<Prisma.ReviewCreateManyInput | Prisma.ReviewCreateManyInput[]> => {
  const reviewsData: Prisma.ReviewCreateManyInput[] = [];

  for (let i = 0; i < 20; i++) {
    const productId = await getRandomProductId(prismadb, storeId);
    const numReviews = simpleFaker.number.int({ min: 1, max: 30 });

    for (let j = 0; j < numReviews; j++) {
      reviewsData.push({
        userId: faker.string.uuid(),
        name: faker.person.fullName(),
        rating: simpleFaker.number.int({ min: 1, max: 5 }),
        comment: faker.lorem.paragraph(),
        storeId,
        productId,
      });
    }
  }

  return reviewsData;
};

export async function seedReviews(storeId: string, prismadb: PrismaClient) {
  const reviewsData = await getReviewsData(storeId, prismadb);
  await prismadb.review.createMany({
    data: reviewsData,
  });
  console.log("Reviews seeded successfully!");
}
