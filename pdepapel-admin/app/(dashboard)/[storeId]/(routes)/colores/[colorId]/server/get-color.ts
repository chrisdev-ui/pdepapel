"use server";

import prismadb from "@/lib/prismadb";

export async function getColor(colorId: string) {
  return await prismadb.color.findUnique({
    where: {
      id: colorId,
    },
  });
}
