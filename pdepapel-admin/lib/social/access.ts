import { SocialAccountStatus, SocialPlatform } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { getInstagramConfig, getTikTokConfigurationStatus, INSTAGRAM_TOKEN_REF } from "./config";
import { discoverInstagramAccount, GraphClient } from "./graph";
import { isSocialQueueConfigured } from "./queue";
import { buildSocialSummary } from "./report";

/** Lo que recibe la pantalla: el resumen y si cada red está configurada. Nada de nombres de variables ni tokens. */
export async function getSocialDashboard(storeId: string, days: number) {
  return {
    ...(await buildSocialSummary(prismadb, { storeId, days })),
    platforms: {
      INSTAGRAM: { configured: getInstagramConfig() !== null },
      TIKTOK: { configured: getTikTokConfigurationStatus().configured },
    },
    queueConfigured: isSocialQueueConfigured(),
  };
}

/** Liga la cuenta profesional de la página del token a la tienda (una llamada a Meta, iniciada por la dueña). */
export async function connectInstagramAccount(storeId: string, fetchImpl?: typeof fetch) {
  const config = getInstagramConfig();
  if (!config) return null;
  const info = await discoverInstagramAccount(new GraphClient(config.pageToken, fetchImpl));
  const data = {
    externalId: info.externalId,
    username: info.username?.slice(0, 191) ?? null,
    pageId: info.pageId,
    tokenRef: INSTAGRAM_TOKEN_REF,
    status: SocialAccountStatus.OK,
    statusReason: null,
  };
  const account = await prismadb.socialAccount.upsert({
    where: { storeId_platform: { storeId, platform: SocialPlatform.INSTAGRAM } },
    create: { storeId, platform: SocialPlatform.INSTAGRAM, ...data },
    update: data,
    select: { id: true, platform: true, username: true, status: true },
  });
  return account;
}
