import { fakerES_MX as faker, simpleFaker } from "@faker-js/faker";
import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
  PrismaClient,
  ShippingStatus,
} from "@prisma/client";

const NUMBER_OF_ORDERS = 300;

// Arrays of enum options
const orderStatusOptions = Object.values(OrderStatus);
const paymentMethodOptions = Object.values(PaymentMethod);
const shippingStatusOptions = Object.values(ShippingStatus);

const getRandomEnumValue = (enumOptions: any[]) => {
  const randomIndex = Math.floor(Math.random() * enumOptions.length);
  return enumOptions[randomIndex];
};

const getRandomProductId = async (prismadb: PrismaClient, storeId: string) => {
  const products = await prismadb.product.findMany({ where: { storeId } });
  const randomIndex = Math.floor(Math.random() * products.length);
  return products[randomIndex].id;
};

const createOrderItem = async (
  prismadb: PrismaClient,
  storeId: string,
  orderId: string,
) => {
  const productId = await getRandomProductId(prismadb, storeId);
  const quantity = simpleFaker.number.int({ min: 1, max: 5 });
  return {
    orderId,
    productId,
    quantity,
  };
};

const createShippingDetails = () => {
  return {
    status: getRandomEnumValue(shippingStatusOptions),
    courier: faker.airline.airline().name,
    cost: simpleFaker.number.int({ min: 5000, max: 15000 }),
    trackingCode: simpleFaker.string.hexadecimal({
      length: 10,
      casing: "mixed",
      prefix: "0x",
    }),
  };
};

const createPaymentDetails = () => {
  return {
    method: getRandomEnumValue(paymentMethodOptions),
    transactionId: faker.finance.iban(),
    details: faker.finance.transactionDescription(),
  };
};

// Generate realistic Colombian phone numbers
const generateColombianPhone = () => {
  const secondDigit = Math.random() < 0.5 ? "1" : "2";
  const remainingDigits = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 10),
  ).join("");
  return `3${secondDigit}${remainingDigits}`;
};

// Calculate order totals
const calculateOrderTotals = (
  orderItems: Array<{ productId: string; quantity: number; price: number }>,
  couponDiscount: number = 0,
  discount: number = 0,
) => {
  const subtotal = orderItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const total = Math.max(0, subtotal - couponDiscount - discount);
  return { subtotal, total };
};

export async function seedOrders(storeId: string, prismadb: PrismaClient) {
  console.log("Starting to seed orders...");

  // Get available products with prices
  const products = await prismadb.product.findMany({
    where: { storeId },
    select: { id: true, price: true },
  });

  if (products.length === 0) {
    console.warn("No products found. Skipping order seeding.");
    return;
  }

  // Get available coupons for some orders
  const coupons = await prismadb.coupon.findMany({
    where: { storeId, isActive: true },
    take: 10, // Use only first 10 coupons
  });

  // Generate unique order numbers
  const orderNumberSets = new Set<string>();
  while (orderNumberSets.size < NUMBER_OF_ORDERS) {
    orderNumberSets.add(`ORD-${faker.string.alphanumeric(8).toUpperCase()}`);
  }

  const orderNumbers = Array.from(orderNumberSets);

  // Create diverse customer profiles (some customers will have multiple orders)
  const customerProfiles = Array.from({ length: 80 }, () => ({
    fullName: faker.person.fullName(),
    phone: generateColombianPhone(),
    email: Math.random() > 0.3 ? faker.internet.email() : undefined, // 70% have emails
    address: `${faker.location.streetAddress()}, ${faker.location.city()}, Colombia`,
    documentId: Math.random() > 0.5 ? faker.string.numeric(10) : undefined, // 50% have document ID
  }));

  console.log(
    `Creating ${NUMBER_OF_ORDERS} orders with diverse customer data...`,
  );

  for (let i = 0; i < NUMBER_OF_ORDERS; i++) {
    try {
      const createdAt = faker.date.past({ years: 1 });
      const status = getRandomEnumValue(orderStatusOptions);

      // 60% chance to reuse existing customer, 40% chance new customer
      const customer =
        Math.random() > 0.4
          ? customerProfiles[
              Math.floor(Math.random() * customerProfiles.length)
            ]
          : {
              fullName: faker.person.fullName(),
              phone: generateColombianPhone(),
              email: Math.random() > 0.3 ? faker.internet.email() : undefined,
              address: `${faker.location.streetAddress()}, ${faker.location.city()}, Colombia`,
              documentId:
                Math.random() > 0.5 ? faker.string.numeric(10) : undefined,
            };

      // Generate random order items (1-4 products per order)
      const numItems = simpleFaker.number.int({ min: 1, max: 4 });
      const orderItems = [];
      const selectedProductIds = new Set<string>();

      for (let j = 0; j < numItems; j++) {
        let product;
        do {
          product = products[Math.floor(Math.random() * products.length)];
        } while (selectedProductIds.has(product.id));

        selectedProductIds.add(product.id);

        orderItems.push({
          productId: product.id,
          quantity: simpleFaker.number.int({ min: 1, max: 3 }),
          price: product.price,
        });
      }

      // Calculate totals
      const baseSubtotal = orderItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );

      // 15% chance to apply a coupon (only for orders > 20000)
      let couponDiscount = 0;
      let appliedCoupon = null;
      if (Math.random() < 0.15 && baseSubtotal > 20000 && coupons.length > 0) {
        appliedCoupon = coupons[Math.floor(Math.random() * coupons.length)];
        if (appliedCoupon.type === DiscountType.PERCENTAGE) {
          couponDiscount = (baseSubtotal * appliedCoupon.amount) / 100;
        } else {
          couponDiscount = appliedCoupon.amount;
        }
      }

      // 10% chance to apply additional discount (admin applied)
      let discount = 0;
      let discountType = null;
      let discountReason = null;
      if (Math.random() < 0.1) {
        discountType =
          Math.random() > 0.5 ? DiscountType.PERCENTAGE : DiscountType.FIXED;
        if (discountType === DiscountType.PERCENTAGE) {
          const discountPercent = simpleFaker.number.int({ min: 5, max: 20 });
          discount = (baseSubtotal * discountPercent) / 100;
        } else {
          discount = simpleFaker.number.int({ min: 2000, max: 10000 });
        }
        discountReason = faker.lorem.sentence(3);
      }

      const totals = calculateOrderTotals(orderItems, couponDiscount, discount);

      // Create order
      const order = await prismadb.order.create({
        data: {
          orderNumber: orderNumbers[i],
          storeId,
          status,
          fullName: customer.fullName,
          phone: customer.phone,
          email: customer.email || "",
          address: customer.address,
          documentId: customer.documentId,
          userId: Math.random() > 0.7 ? faker.string.uuid() : undefined, // 30% are logged-in users
          guestId: Math.random() > 0.7 ? faker.string.uuid() : undefined, // 30% are guest users
          subtotal: totals.subtotal,
          discount,
          discountType,
          discountReason,
          couponId: appliedCoupon?.id,
          couponDiscount,
          total: totals.total,
          createdAt,
          updatedAt: createdAt,
        },
      });

      // Create order items
      await prismadb.orderItem.createMany({
        data: orderItems.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
        })),
      });

      // Create shipping details
      const shippingDetails = createShippingDetails();
      await prismadb.shipping.create({
        data: {
          orderId: order.id,
          ...shippingDetails,
          storeId,
        },
      });

      // Create payment details
      const paymentDetails = createPaymentDetails();
      await prismadb.paymentDetails.create({
        data: {
          orderId: order.id,
          ...paymentDetails,
          storeId,
        },
      });

      // Update coupon usage for PAID orders
      if (appliedCoupon && status === OrderStatus.PAID) {
        await prismadb.coupon.update({
          where: { id: appliedCoupon.id },
          data: {
            usedCount: {
              increment: 1,
            },
          },
        });
      }

      if ((i + 1) % 50 === 0) {
        console.log(`Created ${i + 1}/${NUMBER_OF_ORDERS} orders...`);
      }
    } catch (error) {
      console.error(`Error creating order ${i + 1}:`, error);
    }
  }

  console.log("Orders seeded successfully!");
}
