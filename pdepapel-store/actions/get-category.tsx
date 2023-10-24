import { Category } from "@/types";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/categories`;

export const getCategory = async (id: string): Promise<Category> => {
  const response = await fetch(`${API_URL}/${id}`);

  return response.json();
};
