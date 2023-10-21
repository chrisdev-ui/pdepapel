import { Billboard } from "@/types/types";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/billboards`;

export const getBillboards = async (): Promise<Billboard[]> => {
  const response = await fetch(API_URL);
  return response.json();
};
