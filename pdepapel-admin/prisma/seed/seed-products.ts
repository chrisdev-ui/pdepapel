import { fakerES_MX as faker, simpleFaker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";

let trueCount = 0;

function getRandomBoolean() {
  if (!trueCount) {
    trueCount = 0;
  }

  if (trueCount >= 8) {
    return false;
  }

  const value = Math.random() < 0.5;

  if (value) {
    trueCount++;
  }

  return value;
}

const getRandomCategoryId = async (prismadb: PrismaClient, storeId: string) => {
  const categories = await prismadb.category.findMany({ where: { storeId } });
  const randomIndex = Math.floor(Math.random() * categories.length);
  return categories[randomIndex].id;
};

const getRandomSizeId = async (prismadb: PrismaClient, storeId: string) => {
  const sizes = await prismadb.size.findMany({ where: { storeId } });
  const randomIndex = Math.floor(Math.random() * sizes.length);
  return sizes[randomIndex].id;
};

const getRandomColorId = async (prismadb: PrismaClient, storeId: string) => {
  const colors = await prismadb.color.findMany({ where: { storeId } });
  const randomIndex = Math.floor(Math.random() * colors.length);
  return colors[randomIndex].id;
};

const getRandomDesignId = async (prismadb: PrismaClient, storeId: string) => {
  const designs = await prismadb.design.findMany({ where: { storeId } });
  const randomIndex = Math.floor(Math.random() * designs.length);
  return designs[randomIndex].id;
};

const getRandomSupplierId = async (prismadb: PrismaClient, storeId: string) => {
  const suppliers = await prismadb.supplier.findMany({ where: { storeId } });
  const randomIndex = Math.floor(Math.random() * suppliers.length);
  return suppliers[randomIndex].id;
};

const getProductData = async (
  prismadb: PrismaClient,
  storeId: string,
): Promise<Prisma.ProductCreateManyInput | Prisma.ProductCreateManyInput[]> => {
  const productsSet = new Set<{
    name: string;
    sku: string;
  }>();

  const products: Prisma.ProductCreateManyInput[] = [];

  while (productsSet.size < 1000) {
    productsSet.add({
      name: faker.commerce.productName(),
      sku: faker.string.alphanumeric(10),
    });
  }

  for (let i = 0; i < productsSet.size; i++) {
    const categoryId = await getRandomCategoryId(prismadb, storeId);
    const sizeId = await getRandomSizeId(prismadb, storeId);
    const colorId = await getRandomColorId(prismadb, storeId);
    const designId = await getRandomDesignId(prismadb, storeId);
    const supplierId = await getRandomSupplierId(prismadb, storeId);
    const name = Array.from(productsSet)[i].name;
    const sku = Array.from(productsSet)[i].sku;

    const acqPrice = Number(
      faker.commerce.price({
        min: 3500,
        max: 100000,
        dec: 0,
      }),
    );

    const price = acqPrice + simpleFaker.number.int({ min: 1, max: 100000 });

    products.push({
      name,
      description: faker.commerce.productDescription(),
      acqPrice,
      price,
      stock: simpleFaker.number.int(100),
      isArchived: getRandomBoolean(),
      isFeatured: getRandomBoolean(),
      categoryId,
      sizeId,
      colorId,
      designId,
      supplierId,
      sku,
      storeId,
    });
  }

  return products;
};

const createProductImages = (productId: string) => {
  const numImages = simpleFaker.number.int({ min: 1, max: 5 });
  const images = [];
  for (let i = 0; i < numImages; i++) {
    images.push({
      productId,
      url: faker.image.urlLoremFlickr({
        width: 500,
        height: 500,
      }),
    });
  }
  return images;
};

export async function seedProducts(storeId: string, prismadb: PrismaClient) {
  // Step 1: Generate product data
  const products = await getProductData(prismadb, storeId);

  // Step 2: Create products in the database
  await prismadb.product.createMany({
    data: products,
  });

  // Step 3: Fetch newly created products
  const newProducts = await prismadb.product.findMany({
    where: { storeId },
  });

  // Step 4: Generate images for each product and flatten the array
  const images = newProducts
    .map(({ id }) => createProductImages(id))
    .reduce((acc, val) => acc.concat(val), []); // Flatten the array

  // Step 5: Create images in the database
  await prismadb.image.createMany({
    data: images,
  });

  console.log("Products and Images seeded successfully!");
}
