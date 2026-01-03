import { PrismaClient } from "../generated/prisma/client";

export async function clearDB(storeId: string, prismadb: PrismaClient) {
  const where = {
    where: {
      storeId,
    },
  };
  await prismadb.billboard.deleteMany(where);
  await prismadb.post.deleteMany(where);
  await prismadb.orderItem.deleteMany({});
  await prismadb.paymentDetails.deleteMany(where);
  await prismadb.shipping.deleteMany(where);
  await prismadb.order.deleteMany(where);
  await prismadb.product.deleteMany(where);
  await prismadb.size.deleteMany(where);
  await prismadb.color.deleteMany(where);
  await prismadb.design.deleteMany(where);
  await prismadb.category.deleteMany(where);
  await prismadb.type.deleteMany(where);
  await prismadb.supplier.deleteMany(where);
  await prismadb.review.deleteMany(where);
  await prismadb.mainBanner.deleteMany(where);
  await prismadb.banner.deleteMany(where);
  console.log("Database cleared successfully!");
}
