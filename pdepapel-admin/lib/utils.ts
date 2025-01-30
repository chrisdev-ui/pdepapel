import prismadb from "@/lib/prismadb";
import { clsx, type ClassValue } from "clsx";
import crypto from "crypto";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from "uuid";

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

export const formattedDate = (date: string) =>
  date.replace(
    /(\d{2} de )(\w+)( de \d{4})/,
    (match, p1, p2, p3) => `${p1}${capitalizeFirstLetter(p2)}${p3}`,
  );

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

export const calculatePrice = (
  orderItems: Array<{
    product: {
      name: string;
      id: string;
      price: number;
      images: Array<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        productId: string;
        url: string;
        isMain: boolean;
      }>;
    };
    quantity: number;
  }>,
) => {
  return orderItems.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );
};
