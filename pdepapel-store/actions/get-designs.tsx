import { env } from "@/lib/env.mjs";
import { Design } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/designs`;

export const getDesigns = async (): Promise<Design[]> => {
  const response = await fetch(API_URL);

  return response.json();
};
