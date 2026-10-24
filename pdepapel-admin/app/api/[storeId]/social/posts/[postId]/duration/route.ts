import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse, zodErrorToAppError } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { readJsonBody } from "@/lib/request-body";
import { durationInputSchema, setSocialPostManualDuration } from "@/lib/social/post-settings";
import { SocialPostNotFound } from "@/lib/social/post-tags";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Duración escrita a mano para un reel cuyo video Instagram no entrega: solo la dueña, solo esta tienda. */
export async function PUT(request: Request, { params }: { params: { storeId: string; postId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    const read = await readJsonBody(request, "SOCIAL_POST_DURATION");
    if (!read.ok) throw ErrorFactory.InvalidRequest("No llegó la duración. Vuelve a intentarlo.");
    const parsed = durationInputSchema.safeParse(read.body);
    if (!parsed.success) throw zodErrorToAppError(parsed.error);
    const post = await setSocialPostManualDuration(prismadb, params.storeId, params.postId, parsed.data).catch((error: unknown) => {
      if (error instanceof SocialPostNotFound) throw ErrorFactory.NotFound("No encontramos esa publicación");
      throw error;
    });
    return NextResponse.json(post, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_POST_DURATION", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
