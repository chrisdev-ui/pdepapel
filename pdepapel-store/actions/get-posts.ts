import { withUpstreamTimeout } from "@/lib/catalog-cache";
import { publicEnv as env } from "@/lib/public-env";
import { Post } from "@/types";
import { cache } from "react";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/posts`;

// Misma política que el catálogo (get-categories.ts). El panel invalida la
// etiqueta "posts" y la ruta /nosotros al crear, editar o borrar publicaciones.
const POSTS_CACHE = {
  next: { revalidate: 300, tags: ["catalog", "posts"] },
};

export const getPosts = cache(async (): Promise<Post[]> => {
  try {
    const response = await fetch(API_URL, withUpstreamTimeout(POSTS_CACHE));
    if (!response.ok) return [];
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as Post[]) : [];
  } catch {
    return [];
  }
});
