import { env } from "@/lib/env.mjs";
import { Size } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/sizes`;

export const getSizes = async (): Promise<Size[]> => {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};
