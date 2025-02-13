import {
  INTERRAPIDISIMO_ITERATIONS,
  INTERRAPIDISIMO_IVSIZE,
  INTERRAPIDISIMO_KEYSIZE,
  INTERRAPIDISIMO_SALTSIZE,
} from "@/constants";
import { Coupon, Product, Review } from "@/types";
import { clsx, type ClassValue } from "clsx";
import CryptoES from "crypto-es";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from "uuid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateAverageRating(reviews: Review[] = []) {
  if (!reviews.length) {
    return 0;
  }
  const sumOfRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
  return Math.round(sumOfRatings / reviews.length);
}

export function getCourierIcon(courier: string): string {
  const genericIcon = "/images/generic-shipping.webp";

  const icons: Record<string, string> = {
    interrapidisimo: "/images/interrapidisimo.webp",
    servientrega: "/images/servientrega.webp",
    envia: "/images/envia.webp",
    coordinadora: "/images/coordinadora.webp",
    tcc: "/images/tcc.webp",
    deprisa: "/images/deprisa.webp",
  };

  const courierLower = courier.toLocaleLowerCase();

  if (courierLower in icons) {
    return icons[courierLower];
  }
  return genericIcon;
}

export function generateGuestId() {
  return `guest_${uuidv4()}`;
}

export function formatPhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");

  if (digits.length === 12) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, "(+$1) $2 $3 $4");
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3");
  }

  return phoneNumber;
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function encrypt(guide: string, password: string) {
  const salt = CryptoES.lib.WordArray.random(INTERRAPIDISIMO_SALTSIZE / 8);

  const key = CryptoES.PBKDF2(password, salt, {
    keySize: INTERRAPIDISIMO_KEYSIZE / 32,
    iterations: INTERRAPIDISIMO_ITERATIONS,
  });

  const iv = CryptoES.lib.WordArray.random(INTERRAPIDISIMO_IVSIZE / 8);

  const encrypted = CryptoES.AES.encrypt(guide, key, {
    iv: iv,
    padding: CryptoES.pad.Pkcs7,
    mode: CryptoES.mode.CBC,
  });

  return hexToBase64(salt.concat(iv) + base64ToHex(encrypted.toString()));
}

export function desencrypt(guide: string, password: string) {
  const salt = CryptoES.lib.WordArray.random(INTERRAPIDISIMO_SALTSIZE / 8);

  const key = CryptoES.PBKDF2(password, salt, {
    keySize: INTERRAPIDISIMO_KEYSIZE / 32,
    iterations: INTERRAPIDISIMO_ITERATIONS,
  });

  const iv = CryptoES.lib.WordArray.random(INTERRAPIDISIMO_IVSIZE / 8);

  const encrypted = CryptoES.AES.encrypt(guide, key, {
    iv: iv,
    padding: CryptoES.pad.Pkcs7,
    mode: CryptoES.mode.CBC,
  });

  return hexToBase64(salt.concat(iv) + base64ToHex(encrypted.toString()));
}

export function hexToBase64(hexStr: string): string {
  const cleanHexStr = hexStr.replace(/\s+/g, "").replace(/\r|\n/g, "");

  const byteArray: number[] = [];
  for (let i = 0; i < cleanHexStr.length; i += 2) {
    const byte = parseInt(cleanHexStr.substr(i, 2), 16);
    byteArray.push(byte);
  }

  return btoa(String.fromCharCode.apply(null, byteArray));
}

export function base64ToHex(str: string) {
  const bin = atob(str.replace(/[ \r\n]+$/, ""));
  const hex = new Array(bin.length);

  for (let i = 0; i < bin.length; i++) {
    const charCode = bin.charCodeAt(i);
    let tmp = (charCode & 0xf).toString(16);
    tmp += (charCode >> 4).toString(16);
    hex[i] = tmp.length === 1 ? "0" + tmp : tmp;
  }

  return hex.join("");
}

export const calculateTotals = (
  orderItems: Product[],
  coupon: Coupon | null,
) => {
  const subtotal = orderItems.reduce(
    (total, item) => total + Number(item.price) * Number(item.quantity ?? 1),
    0,
  );

  let couponDiscount = 0;
  if (
    coupon &&
    coupon.isActive &&
    subtotal >= Number(coupon.minOrderValue ?? 0)
  ) {
    couponDiscount =
      coupon.type === "PERCENTAGE"
        ? (subtotal * coupon.amount) / 100
        : Math.min(coupon.amount, subtotal);
  }

  const total = Math.max(subtotal - couponDiscount, 0);

  return {
    subtotal,
    total,
    couponDiscount,
  };
};
