import { Prisma, PrismaClient, Social } from "@prisma/client";

const postIds = ["Cr4eqKyJ9cr", "Cr2CqHTOUAf", "Cq62dI1Oc27", "Cq60futuRuf"];

const getPosts = (
  storeId: string,
): Prisma.PostCreateManyInput | Prisma.PostCreateManyInput[] => {
  return Array.from(postIds).map((postId) => ({
    storeId,
    social: Social.Instagram,
    postId,
  }));
};

export async function seedPosts(storeId: string, prismadb: PrismaClient) {
  const posts = getPosts(storeId);

  await prismadb.post.createMany({
    data: posts,
  });

  console.log("Posts seeded successfully!");
}
