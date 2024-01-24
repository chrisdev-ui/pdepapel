import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  createNewBillboard,
  getBillboardsByStoreId,
} from "@/helpers/billboards-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { BillboardsBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: BillboardsBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["label", "imageUrl"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const billboard = await createNewBillboard({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(billboard);
  } catch (error: unknown) {
    console.log("[BILLBOARDS_POST]", error);
    return handleErrorResponse("[BILLBOARDS_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const billboards = await getBillboardsByStoreId(params.storeId);
    return NextResponse.json(billboards);
  } catch (error) {
    console.log("[BILLBOARDS_GET]", error);
    return handleErrorResponse("[BILLBOARDS_GET_ERROR]", 500);
  }
}
