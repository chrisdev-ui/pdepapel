"use server";

import prismadb from "@/lib/prismadb";

export async function getDesign(designId: string) {
  return await prismadb.design.findUnique({
    where: {
      id: designId,
    },
  });
}
