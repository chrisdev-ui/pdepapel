import { BATCH_SIZE, DEFAULT_COUNTRY } from "@/constants";
import prismadb from "@/lib/prismadb";
import {
  Order,
  OrderItem,
  OrderStatus,
  PaymentDetails,
  PaymentMethod,
  Prisma,
  Product,
  ShippingStatus,
} from "@prisma/client";
import { clsx, type ClassValue } from "clsx";
import crypto from "crypto";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from "uuid";
import { ErrorFactory } from "./api-errors";
import { env } from "./env.mjs";
import { formatValue } from "react-currency-input-field";
import { round2 } from "@/lib/order-totals";

export { getDatePresets, type CustomDate } from "@/lib/date-presets";
export { formatPhoneNumber, normalizePhone } from "@/lib/phone";
export {
  calculateOrderTotals,
  round2,
  type DiscountConfig,
  type OrderTotals,
} from "@/lib/order-totals";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

/**
 * Último pedido de QUIEN está comprando, para el freno de «una orden cada
 * pocos minutos».
 *
 * El `OR` se arma solo con los identificadores que existen: `{ userId: null }`
 * casa con TODOS los pedidos de invitadas, así que una compra bloqueaba a
 * todas las demás invitadas de la tienda. Sin identificador no hay a quién
 * frenar y se devuelve null.
 */
export async function getLastOrderTimestamp(
  userId: string | null | undefined,
  guestId: string | null | undefined,
  storeId: string,
) {
  if (!storeId) return null;

  const actor: Prisma.OrderWhereInput[] = [];
  if (userId) actor.push({ userId });
  if (guestId) actor.push({ guestId });
  if (actor.length === 0) return null;

  const lastOrder = await prismadb.order.findFirst({
    where: { OR: actor, storeId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return lastOrder?.createdAt;
}

export const capitalizeFirstLetter = (string: string) => {
  return string.charAt(0).toUpperCase() + string.slice(1);
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

/** El enlace de pago solo necesita identificar y nombrar el producto de cada línea. */
export type CheckoutOrderItem = OrderItem & {
  product: Pick<Product, "id" | "name" | "price"> | null;
};

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

  const url = `https://checkout.wompi.co/p/?public-key=${env.WOMPI_API_KEY}&currency=COP&amount-in-cents=${amountInCents}&reference=${order.id}&signature:integrity=${signatureIntegrity}&redirect-url=${env.FRONTEND_STORE_URL}/pedido/${order.id}&expiration-time=${expirationTime}`;

  return url;
}

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
    case PaymentMethod.Wompi:
      return "Pago en línea (Tarjeta, PSE, Nequi)";
    case PaymentMethod.BankTransfer:
      return "Transferencia Bancaria Directa";
    case PaymentMethod.COD:
      return "Pago contra entrega";
    case PaymentMethod.CASH:
      return "Pago en efectivo";
    case PaymentMethod.Bold:
      return "Pago en línea (Tarjeta, PSE, Nequi)";
    case PaymentMethod.PayU:
      return "Pago en línea (No disponible)";
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
  // For data that changes frequently (e.g., products, stock, orders)
  DYNAMIC: {
    "Cache-Control": "public, s-maxage=0, must-revalidate",
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
