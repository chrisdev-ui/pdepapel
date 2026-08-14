import { env } from "@/lib/env.mjs";
import { MainBanner } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/main-banner`;
const CATALOG_CACHE = {
  next: { revalidate: 300, tags: ["catalog"] },
};

export const getMainBanner = async (): Promise<MainBanner> => {
  try {
    const response = await fetch(API_URL, CATALOG_CACHE);
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
