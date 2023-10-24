import { Type } from "@/types";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/types`;

export const getTypes = async (): Promise<Type[]> => {
  const response = await fetch(API_URL);

  return response.json();
};
