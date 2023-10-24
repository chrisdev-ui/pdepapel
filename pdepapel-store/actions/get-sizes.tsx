import { Size } from "@/types";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/sizes`;

export const getSizes = async (): Promise<Size[]> => {
  const response = await fetch(API_URL);

  return response.json();
};
