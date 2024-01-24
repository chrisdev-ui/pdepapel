import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { createNewPost, getPostsByStoreId } from "@/helpers/posts-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { PostBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: PostBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["social", "postId"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const post = await createNewPost({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(post);
  } catch (error) {
    console.log("[POSTS_POST]", error);
    return handleErrorResponse("[POSTS_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const posts = await getPostsByStoreId(params.storeId);
    return NextResponse.json(posts);
  } catch (error) {
    console.log("[POSTS_GET]", error);
    return handleErrorResponse("[POSTS_GET_ERROR]", 500);
  }
}
