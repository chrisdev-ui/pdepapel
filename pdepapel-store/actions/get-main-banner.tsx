import { MainBanner } from "@/types";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/main-banner`;

export const getMainBanner = async (): Promise<MainBanner> => {
  const response = await fetch(API_URL);
  return response.json();
};
