"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getBox(boxId: string) {
  headers();
  const box = await prismadb.box.findUnique({
    where: {
      id: boxId,
    },
  });

  return box;
}
