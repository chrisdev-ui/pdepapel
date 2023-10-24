import { Category } from "@/types";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/categories`;

export const getCategories = async (): Promise<Category[]> => {
  const response = await fetch(API_URL);

  return response.json();
};
