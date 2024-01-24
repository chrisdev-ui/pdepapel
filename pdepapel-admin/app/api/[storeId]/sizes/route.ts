import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { handleErrorResponse } from "@/helpers/response";
import { createNewSize, getSizesByStoreId } from "@/helpers/sizes-actions";
import { validateMandatoryFields } from "@/helpers/validation";
import { SizeBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: SizeBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name", "value"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const size = await createNewSize({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(size);
  } catch (error) {
    console.log("[SIZES_POST]", error);
    return handleErrorResponse("[SIZES_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const sizes = await getSizesByStoreId(params.storeId);
    return NextResponse.json(sizes);
  } catch (error) {
    console.log("[SIZES_GET]", error);
    return handleErrorResponse("[SIZES_GET_ERROR]", 500);
  }
}
