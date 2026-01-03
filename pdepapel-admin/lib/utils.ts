import { BATCH_SIZE, DEFAULT_COUNTRY } from "@/constants";
import type { Order, OrderItem, PaymentDetails, Product } from "@prisma/client";
import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
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

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { formatValue } from "react-currency-input-field";
import { parsePhoneNumber } from "libphonenumber-js";

export function currencyFormatter(value: number | string | undefined) {
  return formatValue({
    value: value?.toString(),
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

export const formatPhoneNumber = (phone: string | null | undefined) => {
  if (!phone) return null;
  try {
    const phoneNumber = parsePhoneNumber(phone);
    return phoneNumber ? phoneNumber.format("INTERNATIONAL") : phone;
  } catch (error) {
    return phone;
  }
};

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
