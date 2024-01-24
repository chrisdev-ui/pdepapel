import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  createNewDesign,
  getDesignsByStoreId,
} from "@/helpers/designs-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { DesignBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: DesignBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const design = await createNewDesign({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(design);
  } catch (error) {
    console.log("[DESIGNS_POST]", error);
    return handleErrorResponse("[DESIGNS_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const designs = await getDesignsByStoreId(params.storeId);
    return NextResponse.json(designs);
  } catch (error) {
    console.log("[DESIGNS_GET]", error);
    return handleErrorResponse("[DESIGNS_GET_ERROR]", 500);
  }
}
