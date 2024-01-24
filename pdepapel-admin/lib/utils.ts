import { CouponType, DiscountType } from "@prisma/client";
import { clsx, type ClassValue } from "clsx";
import crypto from "crypto";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from "uuid";
import { CheckoutOrder } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "COP",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

export const generateGuestId = () => `guest_${uuidv4()}`;

export const generateOrderNumber = () =>
  `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export const generateRandomSKU = (source?: string) =>
  `SKU-${source ? `${source}-` : ""}${String(Date.now()).slice(
    -5,
  )}-${Math.floor(Math.random() * 10000)}`;

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

export function calculateTotalAmount(order: CheckoutOrder): number {
  const { orderItems, coupon } = order;
  const currentDate = new Date();
  const totalAmount = orderItems.reduce((acc, orderItem) => {
    const discount = orderItem.variant.discount;
    const price = Number(orderItem.variant.price);
    const quantity = orderItem.quantity;
    let subtotal = price * quantity;
    if (
      discount &&
      discount.startDate &&
      discount.endDate &&
      discount.startDate <= currentDate &&
      discount.endDate >= currentDate
    ) {
      switch (discount.type) {
        case DiscountType.PERCENTAGE:
          subtotal -= price * (discount.amount / 100) * quantity;
          break;
        case DiscountType.FIXED:
          subtotal -= discount.amount * quantity;
          break;
        case DiscountType.BUY_X_GET_Y: {
          const { x, y } = discount;
          if (x && y && quantity >= x) {
            const freeItems = y - x;
            const itemsToCollect = Math.abs(
              Math.floor(quantity - y) * freeItems,
            );
            const discountQuantity = quantity - itemsToCollect;
            subtotal -= price * discountQuantity;
          }
          break;
        }
        default:
          break;
      }
    }
    return acc + subtotal;
  }, 0);

  if (coupon) {
    const { validFrom, validUntil } = coupon;
    if (
      validFrom &&
      validUntil &&
      validFrom <= currentDate &&
      validUntil >= currentDate
    ) {
      switch (coupon.type) {
        case CouponType.PERCENTAGE:
          return totalAmount - totalAmount * (coupon.amount / 100);
        case CouponType.FIXED:
          return totalAmount - coupon.amount;
        default:
          return totalAmount;
      }
    }
  }

  return totalAmount;
}
