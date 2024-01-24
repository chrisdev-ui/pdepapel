import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { handleErrorResponse } from "@/helpers/response";
import { createNewTag, getTagsByStoreId } from "@/helpers/tags-actions";
import { validateMandatoryFields } from "@/helpers/validation";
import { TagBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: TagBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const tag = await createNewTag({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(tag);
  } catch (error) {
    console.log("[TAGS_POST]", error);
    return handleErrorResponse("[TAGS_POST_ERROR]", 500);
  }
}

export async function GET({ params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const tags = await getTagsByStoreId(params.storeId);
    return NextResponse.json(tags);
  } catch (error) {
    console.log("[TAGS_GET]", error);
    return handleErrorResponse("[TAGS_GET_ERROR]", 500);
  }
}
