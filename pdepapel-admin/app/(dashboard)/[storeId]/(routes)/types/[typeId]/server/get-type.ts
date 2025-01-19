"use server";

import prismadb from "@/lib/prismadb";

export async function getType(id: string) {
  return await prismadb.type.findUnique({
    where: {
      id,
    },
  });
}
