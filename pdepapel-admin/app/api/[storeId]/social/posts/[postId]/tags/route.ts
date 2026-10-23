import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse, zodErrorToAppError } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { postTagsInputSchema, setSocialPostTags, SocialPostNotFound, TooManySocialTags } from "@/lib/social/post-tags";
import { SOCIAL_TAGS_PER_KIND_MAX } from "@/lib/social/tags";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Formato y Gancho de una publicación: solo la dueña, y solo publicaciones de esta tienda. */
export async function PUT(request: Request, { params }: { params: { storeId: string; postId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    const parsed = postTagsInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw zodErrorToAppError(parsed.error);
    const tags = await setSocialPostTags(prismadb, params.storeId, params.postId, parsed.data).catch((error: unknown) => {
      if (error instanceof SocialPostNotFound) throw ErrorFactory.NotFound("No encontramos esa publicación");
      if (error instanceof TooManySocialTags) throw ErrorFactory.InvalidRequest(`Máximo ${SOCIAL_TAGS_PER_KIND_MAX} etiquetas de cada tipo`);
      throw error;
    });
    return NextResponse.json({ tags }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_POST_TAGS", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
