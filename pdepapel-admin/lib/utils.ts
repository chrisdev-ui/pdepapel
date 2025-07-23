import { BATCH_SIZE, DEFAULT_COUNTRY } from "@/constants";
import prismadb from "@/lib/prismadb";
import { clerkClient } from "@clerk/nextjs";
import {
  DiscountType,
  Order,
  OrderItem,
  OrderStatus,
  PaymentDetails,
  PaymentMethod,
  Prisma,
  PrismaClient,
  Product,
  ShippingStatus,
} from "@prisma/client";
import { clsx, type ClassValue } from "clsx";
import crypto from "crypto";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from "uuid";
import { ErrorFactory } from "./api-errors";
import { env } from "./env.mjs";
import { DefaultArgs } from "@prisma/client/runtime/library";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

export const numberFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

export const shortCurrencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  notation: "compact",
  compactDisplay: "short",
});

export const generateGuestId = () => `guest_${uuidv4()}`;

export const generateOrderNumber = () =>
  `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export const generateRandomSKU = () =>
  `SKU-${String(Date.now()).slice(-5)}-${Math.floor(Math.random() * 10000)}`;

export function getPublicIdFromCloudinaryUrl(url: string) {
  // Use a regex pattern to match the structure of the URL and extract the public ID
  const match = url.match(/\/v\d+\/([\w-]+)\.\w+$/);

  // Return the matched public ID or null if not found
  return match ? match[1] : null;
}

export async function generateIntegritySignature({
  reference,
  amountInCents,
  currency,
  expirationTime = "",
  integritySecret,
}: {
  reference: string;
  amountInCents: number;
  currency: string;
  expirationTime?: string;
  integritySecret: string;
}): Promise<string> {
  const stringToSign = `${reference}${amountInCents}${currency}${expirationTime}${integritySecret}`;
  const encodedText = new TextEncoder().encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encodedText);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generatePayUSignature({
  apiKey,
  merchantId,
  referenceCode,
  amount,
  hashAlgorithm = "md5",
  currency = "COP",
  statePol,
}: {
  apiKey: string;
  merchantId: string;
  referenceCode: string;
  amount: number | string;
  hashAlgorithm?: "md5" | "sha1" | "sha256";
  currency?: string;
  statePol?: string;
}): string {
  const stringToSign = `${apiKey}~${merchantId}~${referenceCode}~${amount}~${currency}${
    statePol ? `~${statePol}` : ""
  }`;
  return crypto.createHash(hashAlgorithm).update(stringToSign).digest("hex");
}

export function parseOrderDetails(input: string | null | undefined): {
  customer_email: string;
  payment_method_type: string;
  reference_pol: string;
} {
  if (input === null || input === undefined) {
    return {
      customer_email: "",
      payment_method_type: "",
      reference_pol: "",
    };
  }
  const keyValuePairs = input.split(" | ");
  let parsedData = {
    customer_email: "",
    payment_method_type: "",
    reference_pol: "",
  };

  keyValuePairs.forEach((pair) => {
    const [key, value] = pair.split(": ").map((item) => item.trim());
    if (key === "customer_email") {
      parsedData.customer_email = value;
    } else if (key === "payment_method_type") {
      parsedData.payment_method_type = value;
    } else if (key === "reference_pol") {
      parsedData.reference_pol = value;
    }
  });

  return parsedData;
}

export function parseAndSplitAddress(address: string): {
  shippingAddress: string;
  shippingCity: string;
} {
  let addressSections = address.split(", ");
  addressSections = addressSections.filter((section) => section !== null);
  let shippingAddress = addressSections[0];
  let shippingCity = addressSections[1];
  if (addressSections.length > 2) {
    shippingAddress += ", " + addressSections[1];
    shippingCity = addressSections[2];
  }

  return {
    shippingAddress,
    shippingCity,
  };
}

export async function getLastOrderTimestamp(
  userId: string | null | undefined,
  guestId: string | null | undefined,
  storeId: string,
) {
  if (!userId && !guestId && !storeId) return null;
  const lastOrder = await prismadb.order.findFirst({
    where: { OR: [{ userId }, { guestId }], storeId },
    orderBy: { createdAt: "desc" },
  });

  return lastOrder?.createdAt;
}

export function formatPayUValue(value: string): string {
  const valueNumber = parseFloat(value);
  let formattedValue = valueNumber.toFixed(2);

  if (formattedValue.charAt(formattedValue.length - 1) === "0") {
    formattedValue = valueNumber.toFixed(1);
  }

  return formattedValue;
}

export const capitalizeFirstLetter = (string: string) => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};

export const formatPhoneNumber = (phone: string) => {
  //Filter only numbers from the input
  const cleaned = ("" + phone).replace(/\D/g, "");

  //Check if the input is of correct
  const match = cleaned.match(/^(57|)?(\d{3})(\d{3})(\d{4})$/);

  if (match) {
    const intlCode = match[1] ? "+57 " : "";
    return [intlCode, "(", match[2], ") ", match[3], "-", match[4]].join("");
  }

  return null;
};

export async function checkIfStoreOwner(
  userId: string | null,
  storeId: string,
) {
  if (!userId) return false;
  const storeByUserId = await prismadb.store.findFirst({
    where: {
      id: storeId,
      userId,
    },
  });
  return !!storeByUserId;
}

export async function verifyStoreOwner(userId: string, storeId: string) {
  const isStoreOwner = await checkIfStoreOwner(userId, storeId);
  if (!isStoreOwner) throw ErrorFactory.Unauthorized();
}

export const parseErrorDetails = (
  key: string,
  list: unknown[],
): Record<string, unknown> => ({
  [key]: JSON.stringify(list),
});

export async function getClerkUserById(
  userId: string | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const user = await clerkClient.users.getUser(userId);
  return user ? user.id : null;
}

export function checkRequiredFields(
  fields: Record<string, any>,
  requiredFields: Record<string, string>,
) {
  for (const [field, message] of Object.entries(requiredFields)) {
    if (
      Array.isArray(fields[field]) ? !fields[field]?.length : !fields[field]
    ) {
      throw ErrorFactory.InvalidRequest(message);
    }
  }
}
export interface CheckoutOrder extends Order {
  orderItems: CheckoutOrderItem[];
  payment?: PaymentDetails | null;
}

export type CheckoutOrderItem = OrderItem & { product: Product };

export interface PayUResponse {
  referenceCode: string;
  amount: number;
  tax?: number;
  taxReturnBase?: number;
  currency?: string;
  signature: string;
  test: number;
  responseUrl: string;
  confirmationUrl: string;
  shippingAddress: string;
  shippingCity: string;
  shippingCountry: string;
}

export async function generateWompiPayment(
  order: CheckoutOrder,
): Promise<string> {
  const expirationTime = new Date(
    new Date().setHours(new Date().getHours() + 1),
  ).toISOString();

  const amountInCents = order.total * 100;

  const signatureIntegrity = await generateIntegritySignature({
    reference: order.id,
    amountInCents,
    currency: "COP",
    integritySecret: env.WOMPI_INTEGRITY_KEY,
    expirationTime,
  });

  const url = `https://checkout.wompi.co/p/?public-key=${env.WOMPI_API_KEY}&currency=COP&amount-in-cents=${amountInCents}&reference=${order.id}&signature:integrity=${signatureIntegrity}&redirect-url=${env.FRONTEND_STORE_URL}/order/${order.id}&expiration-time=${expirationTime}`;

  return url;
}

export function generatePayUPayment(order: CheckoutOrder): PayUResponse {
  const { shippingAddress, shippingCity } = parseAndSplitAddress(order.address);
  return {
    referenceCode: order.id,
    amount: order.total,
    signature: generatePayUSignature({
      apiKey: env.PAYU_API_KEY,
      merchantId: env.PAYU_MERCHANT_ID,
      referenceCode: order.id,
      amount: order.total,
    }),
    test: env.NODE_ENV === "production" ? 0 : 1,
    responseUrl:
      env.NODE_ENV === "production"
        ? `${env.FRONTEND_STORE_URL}/order/${order.id}`
        : `https://21dmqprm-3001.use2.devtunnels.ms/order/${order.id}`,
    confirmationUrl:
      env.NODE_ENV === "production"
        ? `${env.ADMIN_WEB_URL}/api/webhook/payu`
        : "https://4d8b-2800-e6-4010-ec51-ac30-1677-a33f-4dd9.ngrok-free.app/api/webhook/payu",
    shippingAddress,
    shippingCity,
    shippingCountry: DEFAULT_COUNTRY,
  };
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  couponDiscount: number;
  total: number;
}

export interface DiscountConfig {
  type: DiscountType;
  amount: number;
}

export function calculateOrderTotals(
  orderItems: Array<{
    product: { price: number };
    quantity: number;
  }>,
  config?: {
    discount?: DiscountConfig;
    coupon?: DiscountConfig;
  },
): OrderTotals {
  const subtotal = orderItems.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );

  let discount = 0;
  if (config?.discount) {
    discount =
      config.discount.type === DiscountType.PERCENTAGE
        ? (subtotal * config.discount.amount) / 100
        : Math.min(config.discount.amount, subtotal);
  }

  let couponDiscount = 0;
  if (config?.coupon) {
    const afterDiscount = subtotal - discount;
    couponDiscount =
      config.coupon.type === DiscountType.PERCENTAGE
        ? (afterDiscount * config.coupon.amount) / 100
        : Math.min(config.coupon.amount, afterDiscount);
  }

  const total = Math.max(0, subtotal - discount - couponDiscount);

  return {
    subtotal,
    discount,
    couponDiscount,
    total,
  };
}

export interface CustomDate {
  name: string;
  from: Date;
  to: Date;
}

export const datePresets: Array<CustomDate> = [
  { name: "Hoy", from: startOfDay(new Date()), to: endOfDay(new Date()) },
  {
    name: "Mañana",
    from: startOfDay(addDays(new Date(), 1)),
    to: endOfDay(addDays(new Date(), 1)),
  },
  {
    name: "Esta semana",
    from: startOfWeek(new Date()),
    to: endOfWeek(new Date()),
  },
  {
    name: "La próxima semana",
    from: startOfWeek(addWeeks(new Date(), 1)),
    to: endOfWeek(addWeeks(new Date(), 1)),
  },
  {
    name: "Este mes",
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  },
  {
    name: "El próximo mes",
    from: startOfMonth(addMonths(new Date(), 1)),
    to: endOfMonth(addMonths(new Date(), 1)),
  },
];

export function getReadableStatus(status: OrderStatus | ShippingStatus) {
  switch (status) {
    case OrderStatus.PENDING:
      return "Pendiente de pago";
    case OrderStatus.PAID:
      return "Pago confirmado";
    case OrderStatus.CANCELLED:
      return "Cancelada";
    case OrderStatus.CREATED:
      return "Creada";
    case ShippingStatus.Preparing:
      return "Preparando envío";
    case ShippingStatus.Shipped:
      return "Enviado";
    case ShippingStatus.InTransit:
      return "En tránsito";
    case ShippingStatus.Delivered:
      return "Entregado";
    case ShippingStatus.Returned:
      return "Devuelto";
    default:
      return String(status);
  }
}

export function getReadablePaymentMethod(method?: PaymentMethod | null) {
  switch (method) {
    case PaymentMethod.BankTransfer:
      return "Transferencia Bancaria";
    case PaymentMethod.COD:
      return "Pago contra entrega";
    case PaymentMethod.PayU:
      return "PayU";
    case PaymentMethod.Wompi:
      return "Wompi";
    default:
      return "No especificado";
  }
}

export const CACHE_HEADERS = {
  // For data that changes very infrequently (e.g., types, sizes, colors)
  STATIC: {
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  },
  // For data that changes occasionally (e.g., categories, designs)
  SEMI_STATIC: {
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
  },
  // For data that changes frequently (e.g., products, orders)
  DYNAMIC: {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  },
  // For data that should not be cached
  NO_CACHE: {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  },
};

export async function processOrderItemsInBatches(
  orderItems: any[],
  storeId: string,
  batchSize: number = BATCH_SIZE,
) {
  const batches = [];
  for (let i = 0; i < orderItems.length; i += batchSize) {
    batches.push(orderItems.slice(i, i + batchSize));
  }

  const allProducts = [];
  for (const batch of batches) {
    const products = await prismadb.product.findMany({
      where: {
        id: {
          in: batch.map((item: any) => item.productId),
        },
        storeId: storeId,
      },
      select: {
        id: true,
        price: true,
        stock: true,
        name: true,
      },
    });
    allProducts.push(...products);
  }

  return allProducts;
}

export async function batchUpdateProductStock(
  tx: Omit<
    PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  stockUpdates: { productId: string; quantity: number }[],
  validateStock: boolean = true,
) {
  if (stockUpdates.length === 0) return;

  // Group updates by product to handle multiple items of same product
  const groupedUpdates = stockUpdates.reduce(
    (acc, update) => {
      if (acc[update.productId]) {
        acc[update.productId] += update.quantity;
      } else {
        acc[update.productId] = update.quantity;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  // If validation is enabled and we have decrements, check stock availability first
  if (validateStock) {
    const productIds = Object.keys(groupedUpdates).filter(
      (productId) => groupedUpdates[productId] > 0,
    );

    if (productIds.length > 0) {
      const products = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
        select: {
          id: true,
          name: true,
          stock: true,
        },
      });

      // Check for insufficient stock
      for (const product of products) {
        const decrementAmount = groupedUpdates[product.id];
        if (decrementAmount > 0 && product.stock < decrementAmount) {
          throw new Error(
            `Insufficient stock for product "${product.name}". Available: ${product.stock}, Required: ${decrementAmount}`,
          );
        }
      }
    }
  }

  // Execute all stock updates in parallel
  const updatePromises = Object.entries(groupedUpdates)
    .map(([productId, quantity]) => {
      if (quantity > 0) {
        // Positive quantity means decrement
        return tx.product.update({
          where: { id: productId },
          data: {
            stock: {
              decrement: quantity,
            },
          },
        });
      } else if (quantity < 0) {
        // Negative quantity means increment
        return tx.product.update({
          where: { id: productId },
          data: {
            stock: {
              increment: Math.abs(quantity),
            },
          },
        });
      }
      // If quantity is 0, no update needed
      return Promise.resolve();
    })
    .filter(Boolean);

  await Promise.all(updatePromises);
}

export async function batchUpdateProductStockResilient(
  tx: Omit<
    PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  stockUpdates: { productId: string; quantity: number }[],
  allowPartialFailures: boolean = true,
) {
  if (stockUpdates.length === 0) return { success: [], failed: [] };

  // Group updates by product to handle multiple items of same product
  const groupedUpdates = stockUpdates.reduce(
    (acc, update) => {
      if (acc[update.productId]) {
        acc[update.productId] += update.quantity;
      } else {
        acc[update.productId] = update.quantity;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  // Get current stock levels for all products
  const productIds = Object.keys(groupedUpdates);
  const products = await tx.product.findMany({
    where: {
      id: {
        in: productIds,
      },
    },
    select: {
      id: true,
      name: true,
      stock: true,
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));
  const successfulUpdates: Array<{
    productId: string;
    quantity: number;
    productName: string;
  }> = [];
  const failedUpdates: Array<{
    productId: string;
    quantity: number;
    productName: string;
    reason: string;
  }> = [];

  // Process each update individually to handle partial failures
  for (const [productId, quantity] of Object.entries(groupedUpdates)) {
    const product = productMap.get(productId);

    if (!product) {
      failedUpdates.push({
        productId,
        quantity,
        productName: "Producto desconocido",
        reason: "Producto no encontrado",
      });
      continue;
    }

    try {
      if (quantity > 0) {
        // Decrement stock - check if sufficient stock available
        if (allowPartialFailures && product.stock < quantity) {
          // Process what we can if partial failures are allowed
          const availableToDecrement = Math.max(0, product.stock);
          if (availableToDecrement > 0) {
            await tx.product.update({
              where: { id: productId },
              data: {
                stock: {
                  decrement: availableToDecrement,
                },
              },
            });
            successfulUpdates.push({
              productId,
              quantity: availableToDecrement,
              productName: product.name,
            });
            failedUpdates.push({
              productId,
              quantity: quantity - availableToDecrement,
              productName: product.name,
              reason: `Stock insuficiente. Procesado: ${availableToDecrement}, Faltante: ${quantity - availableToDecrement}`,
            });
          } else {
            failedUpdates.push({
              productId,
              quantity,
              productName: product.name,
              reason: `Sin stock disponible. Stock actual: ${product.stock}, Requerido: ${quantity}`,
            });
          }
        } else {
          // Normal decrement
          await tx.product.update({
            where: { id: productId },
            data: {
              stock: {
                decrement: quantity,
              },
            },
          });
          successfulUpdates.push({
            productId,
            quantity,
            productName: product.name,
          });
        }
      } else if (quantity < 0) {
        // Increment stock - this should never fail
        await tx.product.update({
          where: { id: productId },
          data: {
            stock: {
              increment: Math.abs(quantity),
            },
          },
        });
        successfulUpdates.push({
          productId,
          quantity: Math.abs(quantity),
          productName: product.name,
        });
      }
    } catch (error) {
      failedUpdates.push({
        productId,
        quantity,
        productName: product.name,
        reason: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return {
    success: successfulUpdates,
    failed: failedUpdates,
  };
}
