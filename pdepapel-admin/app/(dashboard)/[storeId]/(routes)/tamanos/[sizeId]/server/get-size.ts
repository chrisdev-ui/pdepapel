"use server";

import prismadb from "@/lib/prismadb";

export async function getSize(id: string) {
  return await prismadb.size.findUnique({
    where: {
      id,
    },
  });
}
