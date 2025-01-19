"use server";

import prismadb from "@/lib/prismadb";

export async function getPost(id: string) {
  return await prismadb.post.findUnique({
    where: {
      id,
    },
  });
}
