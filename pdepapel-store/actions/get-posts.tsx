import { env } from "@/lib/env.mjs";
import { Post } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/posts`;

export const getPosts = async (): Promise<Post[]> => {
  const response = await fetch(API_URL);

  return response.json();
};
