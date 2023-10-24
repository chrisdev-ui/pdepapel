import { Color } from "@/types";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/colors`;

export const getColors = async (): Promise<Color[]> => {
  const response = await fetch(API_URL);

  return response.json();
};
