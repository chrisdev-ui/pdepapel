import { env } from "@/lib/env.mjs";
import { Type } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/types`;

export const getTypes = async (): Promise<Type[]> => {
  const response = await fetch(API_URL);

  return response.json();
};
