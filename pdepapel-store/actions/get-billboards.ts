import { env } from "@/lib/env.mjs";
import { Billboard } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/billboards`;

export const getBillboards = async (): Promise<Billboard[]> => {
  const response = await fetch(API_URL);
  return response.json();
};
