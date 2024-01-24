import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { handleErrorResponse } from "@/helpers/response";
import { createNewType, getTypesByStoreId } from "@/helpers/types-actions";
import { validateMandatoryFields } from "@/helpers/validation";
import { TypeBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: TypeBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const type = await createNewType({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(type);
  } catch (error) {
    console.log("[TYPES_POST]", error);
    return handleErrorResponse("[TYPES_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const types = await getTypesByStoreId(params.storeId);
    return NextResponse.json(types);
  } catch (error) {
    console.log("[TYPES_GET]", error);
    return handleErrorResponse("[TYPES_GET_ERROR]", 500);
  }
}
