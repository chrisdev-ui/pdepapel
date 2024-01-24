import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { createNewColor, getColorsByStoreId } from "@/helpers/colors-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { ColorBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: ColorBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name", "value"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const color = await createNewColor({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(color);
  } catch (error) {
    console.log("[COLORS_POST]", error);
    return handleErrorResponse("[COLORS_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const colors = await getColorsByStoreId(params.storeId);
    return NextResponse.json(colors);
  } catch (error) {
    console.log("[COLORS_GET]", error);
    return handleErrorResponse("[COLORS_GET_ERROR]", 500);
  }
}
