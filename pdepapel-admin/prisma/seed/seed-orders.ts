import { fakerES_MX as faker, simpleFaker } from "@faker-js/faker";
import {
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

export async function seedOrders(storeId: string, prismadb: PrismaClient) {
  const orderNumberSets = new Set<string>();
  while (orderNumberSets.size < NUMBER_OF_ORDERS) {
    orderNumberSets.add(faker.string.alphanumeric(10));
  }
  for (let i = 0; i < NUMBER_OF_ORDERS; i++) {
    const createdAt = faker.date.past();
    const order = await prismadb.order.create({
      data: {
        orderNumber: Array.from(orderNumberSets)[i],
        storeId,
        status: getRandomEnumValue(orderStatusOptions),
        fullName: faker.person.fullName(),
        phone: (() => {
          const secondDigit = Math.random() < 0.5 ? "1" : "2";
          const remainingDigits = Array.from({ length: 8 }, () =>
            Math.floor(Math.random() * 10),
          ).join("");
          return `3${secondDigit}${remainingDigits}`;
        })(),
        address: faker.location.streetAddress(),
        createdAt,
        updatedAt: createdAt,
      },
    });

    // Create order items
    const orderItems = [];
    for (let j = 0; j < 3; j++) {
      orderItems.push(await createOrderItem(prismadb, storeId, order.id));
    }

    await prismadb.orderItem.createMany({
      data: orderItems.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

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
  }

  console.log("Orders seeded successfully!");
}
