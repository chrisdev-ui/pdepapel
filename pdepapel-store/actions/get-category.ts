import { env } from "@/lib/env.mjs";
import { Category } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/categories`;

export const getCategory = async (id: string): Promise<Category> => {
  try {
    const response = await fetch(`${API_URL}/${id}`);
    if (!response.ok) return { id: "", typeId: "", name: "" };
    return await response.json();
  } catch {
    return { id: "", typeId: "", name: "" };
  }
};
