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
