import { auth } from "@clerk/nextjs/server";
import { SocialAccountStatus, SocialPlatform } from "@prisma/client";
import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { getTikTokConfig } from "@/lib/social/config";
import { saveTikTokCredential } from "@/lib/social/credentials";
import { SocialApiError } from "@/lib/social/errors";
import { consumeSocialOAuthState } from "@/lib/social/oauth-state";
import { createTikTokAdapter, exchangeTikTokCode } from "@/lib/social/tiktok";
import { checkIfStoreOwner } from "@/lib/server/utils";

export const dynamic = "force-dynamic";

type Reason = "denied" | "invalid_state" | "not_owner" | "configuration" | "authorization";

function back(storeId: string | null, result: "conectado" | "error", reason?: Reason) {
  const adminUrl = process.env.ADMIN_WEB_URL;
  if (!adminUrl) return NextResponse.json({ error: "No fue posible volver al panel" }, { status: 500 });
  const url = new URL(storeId ? `/${encodeURIComponent(storeId)}/redes` : "/", adminUrl);
  url.searchParams.set("tiktok", result);
  if (reason) url.searchParams.set("motivo", reason);
  return NextResponse.redirect(url);
}

/**
 * Vuelta de TikTok. Solo la dueña que empezó la conexión la termina: el state
 * es de un solo uso y además la sesión tiene que ser la misma y ser dueña. Ni
 * el código ni los tokens se registran.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const config = getTikTokConfig();
  if (!config) return back(null, "error", "configuration");
  if (!state) return back(null, "error", "invalid_state");

  const claimed = await consumeSocialOAuthState(state, SocialPlatform.TIKTOK, config.encryptionKey);
  if (!claimed) return back(null, "error", "invalid_state");
  if (params.get("error") || !code) return back(claimed.storeId, "error", "denied");

  const { userId } = await auth();
  if (!userId || userId !== claimed.createdBy || !(await checkIfStoreOwner(userId, claimed.storeId))) {
    return back(claimed.storeId, "error", "not_owner");
  }

  try {
    const tokens = await exchangeTikTokCode(config, code, claimed.codeVerifier);
    const credentialId = await saveTikTokCredential(claimed.storeId, tokens, config.encryptionKey);
    const profile = await createTikTokAdapter({ getAccessToken: async () => tokens.accessToken })
      .fetchAccount()
      .catch(() => null);
    const data = {
      externalId: tokens.openId,
      username: profile?.username?.slice(0, 191) ?? null,
      tokenRef: `credential:${credentialId}`,
      status: SocialAccountStatus.OK,
      statusReason: null,
      connectedAt: new Date(),
    };
    await prismadb.socialAccount.upsert({
      where: { storeId_platform: { storeId: claimed.storeId, platform: SocialPlatform.TIKTOK } },
      create: { storeId: claimed.storeId, platform: SocialPlatform.TIKTOK, ...data },
      update: data,
    });
    return back(claimed.storeId, "conectado");
  } catch (error) {
    console.error("[SOCIAL_TIKTOK_CALLBACK] La conexión falló", { code: error instanceof SocialApiError ? error.code : "unexpected" });
    return back(claimed.storeId, "error", "authorization");
  }
}
