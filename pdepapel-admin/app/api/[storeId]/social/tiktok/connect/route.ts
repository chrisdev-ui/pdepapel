import { SocialPlatform } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getTikTokConfig } from "@/lib/social/config";
import { createSocialOAuthState } from "@/lib/social/oauth-state";
import { buildTikTokAuthorizeUrl } from "@/lib/social/tiktok";
import { requireStoreOwner } from "@/lib/store-access";

export const dynamic = "force-dynamic";

/** Solo la dueña: crea el state de un solo uso y la manda a autorizar en TikTok. */
export async function GET(_request: Request, { params }: { params: { storeId: string } }) {
  try {
    const userId = await requireStoreOwner(params.storeId);
    const config = getTikTokConfig();
    if (!config) throw ErrorFactory.Conflict("TikTok no está configurado en el servidor.");
    const { state, codeVerifier } = await createSocialOAuthState({ storeId: params.storeId, platform: SocialPlatform.TIKTOK, createdBy: userId, encryptionKey: config.encryptionKey });
    return NextResponse.redirect(buildTikTokAuthorizeUrl(config, state, codeVerifier));
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_TIKTOK_CONNECT");
  }
}
