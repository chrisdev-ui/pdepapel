"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getPosts(storeId: string) {
  const posts = await prismadb.post.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return posts.map((post) => ({
    id: post.id,
    social: post.social,
    postId: post.postId,
    createdAt: format(post.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
