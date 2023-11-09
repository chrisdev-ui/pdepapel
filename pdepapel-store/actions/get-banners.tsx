import { env } from "@/lib/env.mjs";
import { Banner } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/banners`;

export const getBanners = async (): Promise<Banner[]> => {
  const response = await fetch(API_URL);
  return response.json();
};
