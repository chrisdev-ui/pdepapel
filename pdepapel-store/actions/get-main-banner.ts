import { env } from "@/lib/env.mjs";
import { MainBanner } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/main-banner`;

export const getMainBanner = async (): Promise<MainBanner> => {
  try {
    const response = await fetch(API_URL);
    if (!response.ok)
      return {
        id: "",
        title: "",
        label1: "",
        label2: "",
        highlight: "",
        imageUrl: "",
        callToAction: "",
      };
    return await response.json();
  } catch {
    return {
      id: "",
      title: "",
      label1: "",
      label2: "",
      highlight: "",
      imageUrl: "",
      callToAction: "",
    };
  }
};
