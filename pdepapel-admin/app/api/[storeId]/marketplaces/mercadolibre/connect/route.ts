import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreConfig } from "@/lib/mercadolibre/config";
import { createMercadoLibreAuthorizationUrl } from "@/lib/mercadolibre/oauth";
import { createMercadoLibreOAuthState } from "@/lib/mercadolibre/oauth-state";
import { verifyStoreOwner } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);
    const config = getMercadoLibreConfig();
    const state = await createMercadoLibreOAuthState(params.storeId, userId);

    return NextResponse.redirect(
      createMercadoLibreAuthorizationUrl(config, state),
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_CONNECT_GET");
  }
}
