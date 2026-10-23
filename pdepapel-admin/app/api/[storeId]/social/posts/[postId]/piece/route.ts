import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse, zodErrorToAppError } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { readJsonBody } from "@/lib/request-body";
import { linkPieceInputSchema, linkSocialPosts, SocialPieceError, unlinkSocialPost } from "@/lib/social/post-pieces";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

const toAppError = (error: unknown) => {
  if (!(error instanceof SocialPieceError)) return error;
  if (error.kind === "not_found") return ErrorFactory.NotFound(error.message);
  if (error.kind === "other_piece" || error.kind === "network_taken") return ErrorFactory.Conflict(error.message);
  return ErrorFactory.InvalidRequest(error.message);
};

/** Une la publicación con otra de otra red en una pieza. Solo la dueña, solo publicaciones de esta tienda. */
export async function POST(request: Request, { params }: { params: { storeId: string; postId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    const read = await readJsonBody(request, "SOCIAL_POST_PIECE_LINK");
    if (!read.ok) throw ErrorFactory.InvalidRequest("No llegó la publicación a unir. Vuelve a intentarlo.");
    const parsed = linkPieceInputSchema.safeParse(read.body);
    if (!parsed.success) throw zodErrorToAppError(parsed.error);
    const result = await linkSocialPosts(prismadb, params.storeId, params.postId, parsed.data.otherPostId).catch((error: unknown) => {
      throw toAppError(error);
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_POST_PIECE_LINK", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

/** Separa la publicación de su pieza. */
export async function DELETE(_request: Request, { params }: { params: { storeId: string; postId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    const result = await unlinkSocialPost(prismadb, params.storeId, params.postId).catch((error: unknown) => {
      throw toAppError(error);
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_POST_PIECE_UNLINK", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
