import { env } from "@/lib/env.mjs";
import { Category } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/categories`;

export const getCategory = async (id: string): Promise<Category | null> => {
  try {
    const response = await fetch(`${API_URL}/${id}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};
