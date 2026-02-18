import { env } from "@/lib/env.mjs";
import { Post } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/posts`;

export const getPosts = async (): Promise<Post[]> => {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};
