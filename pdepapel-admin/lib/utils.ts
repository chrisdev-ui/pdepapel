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
import { formatValue } from "react-currency-input-field";
import { parsePhoneNumber } from "libphonenumber-js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Round a number to 2 decimal places to avoid floating-point artifacts */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function currencyFormatter(
  value: number | string | undefined,
  options?: { decimalScale?: number },
) {
  // Round numeric values to avoid floating-point artifacts (e.g. 28352319.599999998)
  const cleanValue =
    typeof value === "number" ? round2(value).toString() : value?.toString();
  return formatValue({
    value: cleanValue,
    decimalScale: options?.decimalScale ?? 0, // COP doesn't use decimals
    intlConfig: {
      locale: "es-CO",
      currency: "COP",
    },
  });
}

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
    shippingCost?: number;
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

  const total = Math.max(
    0,
    subtotal - discount - couponDiscount + (config?.shippingCost || 0),
  );

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    couponDiscount: round2(couponDiscount),
    total: round2(total),
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
    case PaymentMethod.Bold:
      return "Bold";
    case PaymentMethod.Wompi:
      return "Wompi";
    case PaymentMethod.PayU:
      return "PayU";
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
        sku: true,
        images: {
          select: {
            url: true,
          },
          take: 1,
        },
        categoryId: true,
        productGroupId: true,
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
        // Decrement stock - STRICT CHECK: Never do partial updates for decrements
        if (product.stock < quantity) {
          // NEVER decrement if insufficient stock - fail completely
          failedUpdates.push({
            productId,
            quantity,
            productName: product.name,
            reason: `Stock insuficiente. Stock actual: ${product.stock}, Requerido: ${quantity}`,
          });
        } else {
          // Only decrement if we have sufficient stock
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
