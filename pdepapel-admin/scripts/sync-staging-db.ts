import { PrismaClient } from "@prisma/client";

const prismaStaging = new PrismaClient();
const prismaProd = new PrismaClient({
  datasources: {
    db: {
      url: process.env.PROD_DATABASE_URL,
    },
  },
});

async function main() {
  if (!process.env.PROD_DATABASE_URL) {
    console.error("❌ PROD_DATABASE_URL is not defined in .env");
    process.exit(1);
  }

  // 1. Get Stores
  const stagingStore = await prismaStaging.store.findFirst();
  if (!stagingStore) {
    console.error("❌ No staging store found. Please create one first.");
    process.exit(1);
  }
  const prodStore = await prismaProd.store.findFirst();
  if (!prodStore) {
    console.error("❌ No production store found.");
    process.exit(1);
  }
  console.log(
    `✅ Staging: ${stagingStore.name} (${stagingStore.id}) | Prod: ${prodStore.name} (${prodStore.id})`,
  );

  // 2. Clean Staging Data (Reverse Dependency Order)
  console.log("🧹 Cleaning Staging Data...");
  const deleteWhere = { storeId: stagingStore.id };
  const deleteWhereOrder = { order: { storeId: stagingStore.id } };
  const deleteWhereProduct = { product: { storeId: stagingStore.id } };

  // Level 4
  await prismaStaging.shippingTrackingEvent.deleteMany({
    where: { shipping: { storeId: stagingStore.id } },
  });
  await prismaStaging.orderItem.deleteMany({ where: deleteWhereOrder });
  await prismaStaging.shipping.deleteMany({ where: deleteWhere });
  await prismaStaging.paymentDetails.deleteMany({ where: deleteWhere });

  // Level 3
  await prismaStaging.review.deleteMany({ where: deleteWhere });
  await prismaStaging.image.deleteMany({ where: deleteWhereProduct });
  await prismaStaging.offerProduct.deleteMany({
    where: { offer: { storeId: stagingStore.id } },
  });
  await prismaStaging.offerCategory.deleteMany({
    where: { offer: { storeId: stagingStore.id } },
  });
  await prismaStaging.order.deleteMany({ where: deleteWhere });

  // Level 2
  await prismaStaging.product.deleteMany({ where: deleteWhere });
  await prismaStaging.offer.deleteMany({ where: deleteWhere });
  await prismaStaging.banner.deleteMany({ where: deleteWhere });
  await prismaStaging.category.deleteMany({ where: deleteWhere }); // Depends on Type/Billboard?

  // Level 1
  await prismaStaging.mainBanner.deleteMany({ where: deleteWhere });
  await prismaStaging.billboard.deleteMany({ where: deleteWhere });
  await prismaStaging.post.deleteMany({ where: deleteWhere });
  await prismaStaging.coupon.deleteMany({ where: deleteWhere });
  await prismaStaging.shippingQuote.deleteMany({ where: deleteWhere });
  await prismaStaging.box.deleteMany({ where: deleteWhere });
  await prismaStaging.supplier.deleteMany({ where: deleteWhere });
  await prismaStaging.type.deleteMany({ where: deleteWhere });
  await prismaStaging.size.deleteMany({ where: deleteWhere });
  await prismaStaging.color.deleteMany({ where: deleteWhere });
  await prismaStaging.design.deleteMany({ where: deleteWhere });

  console.log("✅ Staging Data Cleaned.");

  // 3. Sync Data (Dependency Order)
  console.log("📥 Syncing Data from Production...");

  // -- Maps for IDs --
  const map = {
    type: new Map<string, string>(),
    billboard: new Map<string, string>(),
    size: new Map<string, string>(),
    color: new Map<string, string>(),
    design: new Map<string, string>(),
    supplier: new Map<string, string>(),
    box: new Map<string, string>(),
    coupon: new Map<string, string>(),
    category: new Map<string, string>(),
    product: new Map<string, string>(),
    offer: new Map<string, string>(),
    order: new Map<string, string>(),
    shipping: new Map<string, string>(),
  };

  // --- Level 1 ---

  // Billboard
  const billboards = await prismaProd.billboard.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of billboards) {
    const created = await prismaStaging.billboard.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.billboard.set(item.id, created.id);
  }
  console.log(`- Synced ${billboards.length} Billboards`);

  // Type
  const types = await prismaProd.type.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of types) {
    const created = await prismaStaging.type.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.type.set(item.id, created.id);
  }
  console.log(`- Synced ${types.length} Types`);

  // Size
  const sizes = await prismaProd.size.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of sizes) {
    const created = await prismaStaging.size.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.size.set(item.id, created.id);
  }

  // Color
  const colors = await prismaProd.color.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of colors) {
    const created = await prismaStaging.color.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.color.set(item.id, created.id);
  }

  // Design
  const designs = await prismaProd.design.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of designs) {
    const created = await prismaStaging.design.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.design.set(item.id, created.id);
  }

  // Supplier
  const suppliers = await prismaProd.supplier.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of suppliers) {
    const created = await prismaStaging.supplier.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.supplier.set(item.id, created.id);
  }

  // Box
  const boxes = await prismaProd.box.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of boxes) {
    const created = await prismaStaging.box.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.box.set(item.id, created.id);
  }

  // Post
  const posts = await prismaProd.post.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of posts) {
    await prismaStaging.post.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
  }

  // Coupon (Independent of products/orders initially)
  const coupons = await prismaProd.coupon.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of coupons) {
    const created = await prismaStaging.coupon.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.coupon.set(item.id, created.id);
  }

  // ShippingQuote
  const quotes = await prismaProd.shippingQuote.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of quotes) {
    await prismaStaging.shippingQuote.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        quotesData: item.quotesData as any,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
  }

  // MainBanner (One-to-one per store usually, but let's sync)
  const mainBanner = await prismaProd.mainBanner.findUnique({
    where: { storeId: prodStore.id },
  });
  if (mainBanner) {
    await prismaStaging.mainBanner.create({
      data: {
        ...mainBanner,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
  }

  // --- Level 2 ---

  // Category (Depends on Type)
  const categories = await prismaProd.category.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of categories) {
    const created = await prismaStaging.category.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        typeId: map.type.get(item.typeId)!,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.category.set(item.id, created.id);
  }
  console.log(`- Synced ${categories.length} Categories`);

  // Banner (Depends on Store, usually simple)
  const banners = await prismaProd.banner.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of banners) {
    await prismaStaging.banner.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
  }

  // Product (Depends on Category, Size, Color, Design, Supplier)
  const products = await prismaProd.product.findMany({
    where: { storeId: prodStore.id },
    include: { images: true },
  });
  for (const item of products) {
    const created = await prismaStaging.product.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        categoryId: map.category.get(item.categoryId)!,
        sizeId: map.size.get(item.sizeId)!,
        colorId: map.color.get(item.colorId)!,
        designId: map.design.get(item.designId)!,
        supplierId: item.supplierId ? map.supplier.get(item.supplierId) : null,
        images: {
          create: item.images.map((img) => ({ url: img.url })),
        },
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.product.set(item.id, created.id);
  }
  console.log(`- Synced ${products.length} Products`);

  // Offer (Depends on Store)
  const offers = await prismaProd.offer.findMany({
    where: { storeId: prodStore.id },
    include: { products: true, categories: true },
  });
  for (const item of offers) {
    const created = await prismaStaging.offer.create({
      data: {
        storeId: stagingStore.id,
        name: item.name,
        label: item.label,
        type: item.type,
        amount: item.amount,
        startDate: item.startDate,
        endDate: item.endDate,
        isActive: item.isActive,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.offer.set(item.id, created.id);

    // OfferProduct
    for (const op of item.products) {
      if (map.product.has(op.productId)) {
        await prismaStaging.offerProduct.create({
          data: {
            offerId: created.id,
            productId: map.product.get(op.productId)!,
          },
        });
      }
    }
    // OfferCategory
    for (const oc of item.categories) {
      if (map.category.has(oc.categoryId)) {
        await prismaStaging.offerCategory.create({
          data: {
            offerId: created.id,
            categoryId: map.category.get(oc.categoryId)!,
          },
        });
      }
    }
  }

  // --- Level 3 ---

  // Review (Depends on Product)
  const reviews = await prismaProd.review.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of reviews) {
    if (map.product.has(item.productId)) {
      await prismaStaging.review.create({
        data: {
          ...item,
          id: undefined,
          storeId: stagingStore.id,
          productId: map.product.get(item.productId)!,
          createdAt: undefined,
          updatedAt: undefined,
        },
      });
    }
  }

  // Order (Depends on Store, Coupon)
  const orders = await prismaProd.order.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of orders) {
    const created = await prismaStaging.order.create({
      data: {
        ...item,
        id: undefined,
        storeId: stagingStore.id,
        orderNumber: item.orderNumber + "-STAGING", // Avoid unique constraint if syncing same DB
        couponId: item.couponId ? map.coupon.get(item.couponId) : null,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    map.order.set(item.id, created.id);
  }
  console.log(`- Synced ${orders.length} Orders`);

  // --- Level 4 ---

  // OrderItems (Depends on Order, Product)
  // Fetch ALL order items for the store via the Order relation logic
  const orderItems = await prismaProd.orderItem.findMany({
    where: { order: { storeId: prodStore.id } },
  });
  for (const item of orderItems) {
    if (
      map.order.has(item.orderId) &&
      item.productId &&
      map.product.has(item.productId)
    ) {
      await prismaStaging.orderItem.create({
        data: {
          id: undefined,
          orderId: map.order.get(item.orderId)!,
          productId: map.product.get(item.productId)!,
          quantity: item.quantity,
        },
      });
    }
  }

  // PaymentDetails (Depends on Order)
  const payments = await prismaProd.paymentDetails.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of payments) {
    if (map.order.has(item.orderId)) {
      await prismaStaging.paymentDetails.create({
        data: {
          ...item,
          id: undefined,
          storeId: stagingStore.id,
          orderId: map.order.get(item.orderId)!,
          createdAt: undefined,
          updatedAt: undefined,
        },
      });
    }
  }

  // Shipping (Depends on Order, Box)
  const shippings = await prismaProd.shipping.findMany({
    where: { storeId: prodStore.id },
  });
  for (const item of shippings) {
    if (map.order.has(item.orderId)) {
      const createdShipping = await prismaStaging.shipping.create({
        data: {
          ...item,
          id: undefined,
          storeId: stagingStore.id,
          orderId: map.order.get(item.orderId)!,
          boxId: item.boxId ? map.box.get(item.boxId) : null,
          createdAt: undefined,
          updatedAt: undefined,
          quotationData: item.quotationData as any,
          originData: item.originData as any,
          destinationData: item.destinationData as any,
        },
      });

      // Tracking Events
      const events = await prismaProd.shippingTrackingEvent.findMany({
        where: { shippingId: item.id },
      });
      for (const event of events) {
        await prismaStaging.shippingTrackingEvent.create({
          data: {
            ...event,
            id: undefined,
            shippingId: createdShipping.id,
            createdAt: undefined,
          },
        });
      }
    }
  }

  console.log("✅ Full Database Sync Complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaStaging.$disconnect();
    await prismaProd.$disconnect();
  });
