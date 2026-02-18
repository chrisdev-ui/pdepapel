import { env } from "@/lib/env.mjs";
import { Category } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/categories`;

export const getCategories = async (): Promise<Category[]> => {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};
