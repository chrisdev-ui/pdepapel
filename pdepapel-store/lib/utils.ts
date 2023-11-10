import { Review } from "@/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
