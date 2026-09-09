"use server";

import { HOME_CONTENT_ADMIN_SELECT } from "@/lib/home-content";
import prismadb from "@/lib/prismadb";

export async function getHomeContents(storeId: string) {
  return prismadb.homeContent.findMany({
    where: { storeId },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    select: HOME_CONTENT_ADMIN_SELECT,
  });
}

export async function getHomeContent(storeId: string, homeContentId: string) {
  return prismadb.homeContent.findFirst({
    where: { id: homeContentId, storeId },
    select: HOME_CONTENT_ADMIN_SELECT,
  });
}

export type HomeContentRow = Awaited<ReturnType<typeof getHomeContents>>[number];
