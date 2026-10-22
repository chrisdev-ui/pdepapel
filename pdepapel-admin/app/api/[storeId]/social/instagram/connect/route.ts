import { NextResponse } from "next/server";

import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { connectInstagramAccount } from "@/lib/social/access";
import { describeInstagramConnectError, SocialApiError } from "@/lib/social/errors";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Liga la cuenta de Instagram del token de la página (META_IG_PAGE_TOKEN) a esta tienda. */
export async function POST(_request: Request, { params }: { params: { storeId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    let account;
    try {
      account = await connectInstagramAccount(params.storeId);
    } catch (error) {
      if (error instanceof SocialApiError) {
        const { status, message } = describeInstagramConnectError(error);
        throw new AppError(message, status, { code: error.code });
      }
      throw error;
    }
    if (!account) throw ErrorFactory.Conflict("Instagram no está configurado en el servidor.");
    return NextResponse.json({ account }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_INSTAGRAM_CONNECT", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
