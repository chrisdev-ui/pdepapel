import { Banner } from "@/types";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/banners`;

export const getBanners = async (): Promise<Banner[]> => {
  const response = await fetch(API_URL);
  return response.json();
};
