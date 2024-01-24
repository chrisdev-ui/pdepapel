import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deletePostById,
  getPostById,
  updatePostById,
} from "@/helpers/posts-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { PostBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  postId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.postId) return handleErrorResponse("Post ID is required", 400);
  try {
    const post = await getPostById(params.postId);
    return NextResponse.json(post);
  } catch (error) {
    console.log("[POST_GET]", error);
    return handleErrorResponse("[POST_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.postId) return handleErrorResponse("Post ID is required", 400);
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
    const post = await updatePostById(params.postId, body);
    return NextResponse.json(post);
  } catch (error) {
    console.log("[POST_PATCH]", error);
    return handleErrorResponse("[POST_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.postId) return handleErrorResponse("Post ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deletePostById(params.postId);
    return handleSuccessResponse("Post was successfully deleted!");
  } catch (error) {
    console.log("[POST_DELETE]", error);
    return handleErrorResponse("[POST_DELETE_ERROR]", 500);
  }
}
